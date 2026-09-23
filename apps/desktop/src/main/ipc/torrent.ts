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
import { requireFileIndex, requireFiniteNumber, requireInfoHash, requireMagnetURI, requirePreferredEpisodeFile } from './validation'

export function setupTorrentIPC(
  mainWindow: BrowserWindow,
  torrentManager: TorrentManager,
  streamServer: StreamServer
): void {
  // ─── Request/Response handlers ───────────────────────────────────

  /** Add a torrent in STREAM mode (ephemeral). */
  ipcMain.handle('torrent:add', async (_event, magnetURI: string, preferredEpisode?: unknown) => {
    try {
      const info = await torrentManager.addTorrent(
        requireMagnetURI(magnetURI),
        preferredEpisode === undefined ? undefined : requirePreferredEpisodeFile(preferredEpisode)
      )
      return info
    } catch (error) {
      console.error('[IPC torrent:add] Error:', (error as Error).message)
      throw error
    }
  })

  /** Add a torrent in DOWNLOAD mode (persistent). */
  ipcMain.handle('torrent:add-download', async (_event, magnetURI: string) => {
    try {
      const info = await torrentManager.addDownload(requireMagnetURI(magnetURI))
      return info
    } catch (error) {
      console.error('[IPC torrent:add-download] Error:', (error as Error).message)
      throw error
    }
  })

  /** Queue a persistent download without interrupting an identical active stream. */
  ipcMain.handle('torrent:queue-download', async (_event, magnetURI: string, activeStreamInfoHash?: string) => {
    try {
      return await torrentManager.queueDownload(
        requireMagnetURI(magnetURI),
        activeStreamInfoHash === undefined ? undefined : requireInfoHash(activeStreamInfoHash)
      )
    } catch (error) {
      console.error('[IPC torrent:queue-download] Error:', (error as Error).message)
      throw error
    }
  })

  /** Remove and destroy a torrent by info hash. */
  ipcMain.handle('torrent:remove', async (_event, infoHash: string) => {
    try {
      const hash = requireInfoHash(infoHash)
      streamServer.clearProbeCache(hash)
      await torrentManager.removeTorrent(hash)
    } catch (error) {
      console.error('[IPC torrent:remove] Error:', (error as Error).message)
      throw error
    }
  })

  /** Cleanup a stream torrent — destroy + delete temp files. */
  ipcMain.handle('torrent:cleanup-stream', async (_event, infoHash: string) => {
    try {
      const hash = requireInfoHash(infoHash)
      streamServer.clearProbeCache(hash)
      await torrentManager.cleanupStream(hash)
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
      return torrentManager.getStreamURL(requireInfoHash(infoHash))
    } catch (error) {
      console.error('[IPC torrent:stream-url] Error:', (error as Error).message)
      throw error
    }
  })

  /** Get stable codec and duration metadata for the selected source file. */
  ipcMain.handle('torrent:media-info', async (_event, infoHash: string) => {
    try {
      const hash = requireInfoHash(infoHash)
      const info = await streamServer.getMediaInfo(hash)
      console.log(
        `[IPC torrent:media-info] ${infoHash}: duration=${info?.duration ?? 0}s transcode=${info?.needsTranscode ?? false}`
      )
      return info
    } catch (error) {
      console.error('[IPC torrent:media-info] Error:', (error as Error).message)
      return null
    }
  })

  /** Select a specific file in a torrent for streaming. */
  ipcMain.handle(
    'torrent:select-file',
    async (_event, infoHash: string, fileIndex: number) => {
      try {
        const hash = requireInfoHash(infoHash)
        streamServer.clearProbeCache(hash)
        return torrentManager.selectFile(hash, requireFileIndex(fileIndex))
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
        torrentManager.notifySeek(
          requireInfoHash(infoHash),
          requireFiniteNumber(positionPercent, 'seek position', 0, 1)
        )
      } catch (error) {
        console.error('[IPC torrent:seek] Error:', (error as Error).message)
        throw error
      }
    }
  )
  /** Prioritize the active playhead while the full selected video downloads. */
  ipcMain.handle(
    'torrent:playback-position',
    async (_event, infoHash: string, currentTime: number, duration: number) => {
      try {
        torrentManager.updatePlaybackPosition(
          requireInfoHash(infoHash),
          requireFiniteNumber(currentTime, 'playback time', 0, 604_800),
          requireFiniteNumber(duration, 'media duration', 0.001, 604_800)
        )
      } catch (error) {
        console.error('[IPC torrent:playback-position] Error:', (error as Error).message)
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
    if (info.mode === 'stream' && !info.requiresFileSelection) {
      void streamServer.getMediaInfo(info.infoHash).catch((error) => {
        console.warn(`[IPC] Media prewarm failed for ${info.infoHash}:`, error)
      })
    }
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
