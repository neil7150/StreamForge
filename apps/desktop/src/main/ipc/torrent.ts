/**
 * Torrent IPC Handlers — Bridges renderer IPC calls to TorrentManager & StreamServer.
 *
 * IPC Channels:
 *   torrent:add           → addTorrent(magnetURI) [stream mode]
 *   torrent:add-download  → addDownload(magnetURI) [download mode]
 *   torrent:remove        → removeTorrent(infoHash)
 *   torrent:cleanup-stream→ cleanupStream(infoHash) [stream cleanup on leave]
 *   torrent:get-all       → getTorrents()
 *   torrent:get-streams   → getStreams()
 *   torrent:get-downloads → getDownloads()
 *   torrent:stream-url    → getStreamURL(infoHash)
 *   torrent:select-file   → selectFile(infoHash, fileIndex)
 *   torrent:seek          → notifySeek(infoHash, positionPercent)
 *
 * Forwarded Events:
 *   torrent:ready    → TorrentInfo
 *   torrent:progress → TorrentProgress
 *   torrent:error    → { infoHash, error }
 */

import { ipcMain, shell, type BrowserWindow } from 'electron'
import type { TorrentManager, TorrentInfo, TorrentProgress } from '../torrent/manager'
import type { StreamServer } from '../torrent/stream-server'

export function setupTorrentIPC(
  mainWindow: BrowserWindow,
  torrentManager: TorrentManager,
  _streamServer: StreamServer
): void {
  // ─── Request/Response handlers ───────────────────────────────────

  /** Add a torrent in STREAM mode (ephemeral). */
  ipcMain.handle('torrent:add', async (_event, magnetURI: string) => {
    try {
      const info = await torrentManager.addTorrent(magnetURI)
      return info
    } catch (error) {
      console.error('[IPC torrent:add] Error:', (error as Error).message)
      throw error
    }
  })

  /** Add a torrent in DOWNLOAD mode (persistent). */
  ipcMain.handle('torrent:add-download', async (_event, magnetURI: string) => {
    try {
      const info = await torrentManager.addDownload(magnetURI)
      return info
    } catch (error) {
      console.error('[IPC torrent:add-download] Error:', (error as Error).message)
      throw error
    }
  })

  /** Remove and destroy a torrent by info hash. */
  ipcMain.handle('torrent:remove', async (_event, infoHash: string) => {
    try {
      torrentManager.removeTorrent(infoHash)
    } catch (error) {
      console.error('[IPC torrent:remove] Error:', (error as Error).message)
      throw error
    }
  })

  /** Cleanup a stream torrent — destroy + delete temp files. */
  ipcMain.handle('torrent:cleanup-stream', async (_event, infoHash: string) => {
    try {
      await torrentManager.cleanupStream(infoHash)
    } catch (error) {
      console.error('[IPC torrent:cleanup-stream] Error:', (error as Error).message)
      throw error
    }
  })

  /** Get all active torrents (both modes). */
  ipcMain.handle('torrent:get-all', async () => {
    try {
      return torrentManager.getTorrents()
    } catch (error) {
      console.error('[IPC torrent:get-all] Error:', (error as Error).message)
      throw error
    }
  })

  /** Get stream-mode torrents only. */
  ipcMain.handle('torrent:get-streams', async () => {
    try {
      return torrentManager.getStreams()
    } catch (error) {
      console.error('[IPC torrent:get-streams] Error:', (error as Error).message)
      throw error
    }
  })

  /** Get download-mode torrents only. */
  ipcMain.handle('torrent:get-downloads', async () => {
    try {
      return torrentManager.getDownloads()
    } catch (error) {
      console.error('[IPC torrent:get-downloads] Error:', (error as Error).message)
      throw error
    }
  })

  /** Get the stream URL for a torrent. */
  ipcMain.handle('torrent:stream-url', async (_event, infoHash: string) => {
    try {
      return torrentManager.getStreamURL(infoHash)
    } catch (error) {
      console.error('[IPC torrent:stream-url] Error:', (error as Error).message)
      throw error
    }
  })

  /** Select a specific file in a torrent for streaming. */
  ipcMain.handle(
    'torrent:select-file',
    async (_event, infoHash: string, fileIndex: number) => {
      try {
        return torrentManager.selectFile(infoHash, fileIndex)
      } catch (error) {
        console.error('[IPC torrent:select-file] Error:', (error as Error).message)
        throw error
      }
    }
  )

  /** Notify the torrent engine of a seek position for piece reprioritization. */
  ipcMain.handle(
    'torrent:seek',
    async (_event, infoHash: string, positionPercent: number) => {
      try {
        torrentManager.notifySeek(infoHash, positionPercent)
      } catch (error) {
        console.error('[IPC torrent:seek] Error:', (error as Error).message)
        throw error
      }
    }
  )

  /** Open the download folder in the system file explorer. */
  ipcMain.handle('torrent:open-download-folder', async () => {
    try {
      shell.openPath(torrentManager.getDownloadPath())
    } catch (error) {
      console.error('[IPC torrent:open-download-folder] Error:', (error as Error).message)
      throw error
    }
  })

  // ─── Forward TorrentManager events to the renderer ─────────────────

  torrentManager.on('torrent:ready', (info: TorrentInfo) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('torrent:ready', info)
    }
  })

  torrentManager.on('torrent:progress', (progress: TorrentProgress) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('torrent:progress', progress)
    }
  })

  torrentManager.on('torrent:error', (errorData: { infoHash: string; error: string }) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('torrent:error', errorData)
    }
  })

  console.log('[IPC] Torrent handlers registered')
}
