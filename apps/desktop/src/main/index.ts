/**
 * StreamForge — Main Process Entry Point
 *
 * Responsibilities:
 *   1. Create the frameless BrowserWindow with dark theme
 *   2. Initialize TorrentManager, StreamServer, and CacheManager
 *   3. Register custom 'media' protocol for cross-origin-free video streaming
 *   4. Register all IPC handlers (torrent, window, cache)
 *   5. Load the renderer (dev server in dev mode, file:// in production)
 *   6. Clean up resources on app quit
 */

import { app, shell, BrowserWindow, net, protocol, session } from 'electron'
import path from 'node:path'
import { is, optimizer } from '@electron-toolkit/utils'

import { TorrentManager } from './torrent/manager'
import { StreamServer } from './torrent/stream-server'
import { CacheManager } from './torrent/cache-manager'

import { setupTorrentIPC } from './ipc/torrent'
import { setupWindowIPC } from './ipc/window'
import { setupCacheIPC } from './ipc/cache'
import { registerSearchHandlers } from './ipc/search'
import { registerCatalogHandlers } from './ipc/catalog'

// ─── Register custom protocol scheme as privileged ─────────────────
// Must happen before app.whenReady(). Enables Range requests, streaming,
// and fetch API access for the media:// scheme used by the video player.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
])

// ─── Core service instances ────────────────────────────────────────
let torrentManager: TorrentManager
let streamServer: StreamServer
let cacheManager: CacheManager
let mainWindow: BrowserWindow | null = null
let shutdownStarted = false

function isBenignWebRTCCloseError(error: unknown): boolean {
  const value = error as { name?: string; message?: string; stack?: string }
  return value?.name === 'OperationError'
    && value?.message === 'User-Initiated Abort, reason=Close called'
    && (value?.stack?.includes('webrtc-polyfill') ?? false)
}

process.on('uncaughtException', (error) => {
  if (isBenignWebRTCCloseError(error)) {
    console.warn('[Main] Ignored expected WebRTC peer-close race')
    return
  }
  console.error('[Main] Uncaught exception:', error)
  app.exit(1)
})

function openSafeExternalURL(rawURL: string): void {
  try {
    const url = new URL(rawURL)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      void shell.openExternal(url.toString())
    }
  } catch {
    console.warn('[Main] Blocked invalid external URL:', rawURL)
  }
}

function isTrustedNavigation(target: string, current: string): boolean {
  try {
    const targetURL = new URL(target)
    const currentURL = new URL(current)

    if (targetURL.protocol === 'file:' && currentURL.protocol === 'file:') {
      return targetURL.pathname === currentURL.pathname
    }

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      return targetURL.origin === new URL(process.env['ELECTRON_RENDERER_URL']).origin
    }
  } catch {
    return false
  }
  return false
}

/**
 * Creates the main application window with a frameless, dark-themed design.
 */
function createWindow(): BrowserWindow {
  const windowIcon = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../resources/icon.png')

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 560,
    minHeight: 480,
    frame: false,
    titleBarStyle: 'hidden',
    icon: windowIcon,
    backgroundColor: '#0a0a0f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  // Show window once content is ready to avoid visual flash
  mainWindow.on('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
    }
  })

  // Keep untrusted pages out of the privileged renderer and only open safe web links externally.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    openSafeExternalURL(details.url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, targetURL) => {
    const currentURL = mainWindow?.webContents.getURL() ?? ''
    if (!isTrustedNavigation(targetURL, currentURL)) {
      event.preventDefault()
      openSafeExternalURL(targetURL)
    }
  })

  // Load the renderer — dev server in development, built file in production
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

/**
 * Application initialization — runs when Electron is ready.
 */
app.whenReady().then(async () => {
  // Apply default electron-toolkit dev optimizations (DevTools shortcuts, etc.)
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 1. Initialize the cache manager (wipes stream cache from previous session)
  cacheManager = new CacheManager()
  await cacheManager.initialize()

  // Clear default session's HTTP disk cache to wipe any leftover scraped
  // torrent-site HTML from previous sessions (prevents Defender false positives)
  await session.defaultSession.clearCache()
  console.log('[Main] Cleared default session cache')

  // 2. Initialize the torrent manager (async — loads ESM WebTorrent module)
  torrentManager = new TorrentManager()
  await torrentManager.initialize()

  // 3. Wipe ephemeral stream cache (ensures clean slate every restart)
  await torrentManager.wipeStreamCache()

  // 4. Start the HTTP stream server
  streamServer = new StreamServer(torrentManager)
  const baseURL = await streamServer.start()
  torrentManager.setStreamBaseURL(baseURL)

  // 5. Intercept stream server requests via the default session
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['http://127.0.0.1:*/*'] },
    (details, callback) => {
      callback({ requestHeaders: details.requestHeaders })
    }
  )

  // Register protocol interceptor: redirect media:// to the HTTP stream server
  protocol.handle('media', async (request) => {
    let targetURL = ''
    try {
      const mediaURL = new URL(request.url)
      if (mediaURL.hostname !== 'stream') {
        return new Response('Unknown media route', { status: 404 })
      }

      const route = `/stream${mediaURL.pathname}${mediaURL.search}`
      if (!/^\/stream\/[a-fA-F0-9]{40}(?:(?:\/\d+)|(?:\/subtitle\/\d+))?(?:\?|$)/.test(route)) {
        return new Response('Invalid media request', { status: 400 })
      }

      targetURL = new URL(route, baseURL).toString()
      return await net.fetch(targetURL, {
        method: request.method,
        headers: request.headers
      })
    } catch (err) {
      console.error(`[Protocol] Error fetching ${targetURL || request.url}:`, err)
      return new Response('Stream error', { status: 500 })
    }
  })

  console.log('[Main] Registered media:// protocol handler')

  // 6. Create the main window
  const window = createWindow()

  // 7. Register all IPC handlers
  setupWindowIPC(window)
  setupTorrentIPC(window, torrentManager, streamServer)
  setupCacheIPC(cacheManager, torrentManager)
  registerSearchHandlers()
  registerCatalogHandlers()

  // 8. Restore persistent downloads from the previous session
  await torrentManager.restoreDownloads()

  console.log('[Main] StreamForge initialized successfully')

  // macOS: re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}).catch((error) => {
  console.error('[Main] Initialization failed:', error)
  app.quit()
})

// ─── Application lifecycle cleanup ──────────────────────────────────

app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until Cmd+Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

async function shutdown(): Promise<void> {
  console.log('[Main] Shutting down...')

  // Destroy the torrent client (stops all torrents, removes temp data)
  if (torrentManager) {
    await torrentManager.destroy()
  }

  // Stop the stream server
  if (streamServer) {
    await streamServer.stop()
  }

  // Final cache cleanup — remove stale files
  if (cacheManager) {
    await cacheManager.cleanupOnExit()
  }
}

app.on('before-quit', (event) => {
  if (shutdownStarted) return

  event.preventDefault()
  shutdownStarted = true
  void shutdown()
    .catch((error) => console.error('[Main] Shutdown failed:', error))
    .finally(() => app.quit())
})
