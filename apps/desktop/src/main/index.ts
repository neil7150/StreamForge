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
      stream: true,
      bypassCSP: true
    }
  }
])

// ─── Disable CORS restrictions for local streaming ─────────────────
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')

// ─── Core service instances ────────────────────────────────────────
let torrentManager: TorrentManager
let streamServer: StreamServer
let cacheManager: CacheManager
let mainWindow: BrowserWindow | null = null

/**
 * Creates the main application window with a frameless, dark-themed design.
 */
function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  // Show window once content is ready to avoid visual flash
  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Open external links in the default browser instead of a new Electron window
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
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
    const urlPath = request.url.replace('media://', '')
    const targetURL = `${baseURL}/${urlPath}`
    console.log(`[Protocol] media://${urlPath} → ${targetURL}`)
    console.log(`[Protocol] Range: ${request.headers.get('Range') || 'none'}`)

    try {
      const fetchResponse = await net.fetch(targetURL, {
        method: request.method,
        headers: request.headers
      })
      return fetchResponse
    } catch (err) {
      console.error(`[Protocol] Error fetching ${targetURL}:`, err)
      return new Response('Stream error', { status: 500 })
    }
  })

  console.log('[Main] Registered media:// protocol handler')

  // 6. Create the main window
  const window = createWindow()

  // 7. Register all IPC handlers
  setupWindowIPC(window)
  setupTorrentIPC(window, torrentManager, streamServer)
  setupCacheIPC(cacheManager)
  registerSearchHandlers()

  // 8. Restore persistent downloads from the previous session
  await torrentManager.restoreDownloads()

  console.log('[Main] StreamForge initialized successfully')

  // macOS: re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// ─── Application lifecycle cleanup ──────────────────────────────────

app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until Cmd+Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
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
    await cacheManager.cleanupOldFiles()
  }
})
