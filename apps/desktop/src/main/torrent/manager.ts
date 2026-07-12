/**
 * TorrentManager — Wraps the WebTorrent client with a high-level API.
 *
 * Dual-mode architecture:
 *   STREAM mode  — Ephemeral. Uses temp dir. Sequential download for playback.
 *                  Auto-cleaned when user leaves the player or restarts the app.
 *   DOWNLOAD mode — Persistent. Uses ~/Downloads/StreamForge/. Full parallel download.
 *                   Survives restarts via downloads.json manifest.
 *
 * Events emitted:
 *   'torrent:ready'    → TorrentInfo   (when metadata is resolved)
 *   'torrent:progress' → TorrentProgress (every 500ms while downloading)
 *   'torrent:error'    → { infoHash, error } (on torrent errors)
 */

import { EventEmitter } from 'node:events'
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import { app } from 'electron'

// WebTorrent v2.x is ESM-only — must use dynamic import()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let WebTorrent: any

// ─── Video file extensions we consider streamable ────────────────────
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.webm', '.mov', '.m4v',
  '.ts', '.ogv', '.flv', '.wmv', '.3gp', '.mpg', '.mpeg'
])

// ─── Types matching the preload's exported interfaces ────────────────

export type TorrentMode = 'stream' | 'download'

export interface TorrentFile {
  name: string
  path: string
  size: number
  type: string
}

export interface TorrentInfo {
  infoHash: string
  name: string
  files: TorrentFile[]
  totalSize: number
  streamURL: string
  ready: boolean
  mode: TorrentMode
}

export interface TorrentProgress {
  infoHash: string
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  numPeers: number
  downloaded: number
  uploaded: number
  totalSize: number
  timeRemaining: number
  ratio: number
  bufferProgress: number
  mode: TorrentMode
}

/** Tracks per-torrent state (selected file index, throttle timer, mode, etc.) */
interface TorrentState {
  selectedFileIndex: number
  progressTimer: ReturnType<typeof setInterval> | null
  mode: TorrentMode
}

/** Persisted download entry saved to downloads.json */
interface DownloadManifestEntry {
  magnetURI: string
  infoHash: string
  name: string
  addedAt: number
}

export class TorrentManager extends EventEmitter {
  private client: any = null
  private streamBaseURL: string = ''
  private initialized: boolean = false

  /** Ephemeral streaming cache — wiped on every app restart */
  private readonly streamPath: string
  /** Persistent download folder — files stay forever */
  private readonly downloadPath: string
  /** Manifest file for restoring downloads across restarts */
  private readonly downloadsManifestPath: string

  /** Per-torrent metadata keyed by infoHash */
  private torrentStates: Map<string, TorrentState> = new Map()

  constructor() {
    super()
    this.streamPath = path.join(os.tmpdir(), 'streamforge-stream')
    this.downloadPath = path.join(os.homedir(), 'Downloads', 'StreamForge')
    this.downloadsManifestPath = path.join(
      app.getPath('userData'),
      'downloads.json'
    )
  }

  /**
   * Async initialization — dynamically imports the ESM-only WebTorrent
   * module and creates the client instance.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // Ensure directories exist
    await fs.mkdir(this.streamPath, { recursive: true })
    await fs.mkdir(this.downloadPath, { recursive: true })

    const mod = await import('webtorrent')
    WebTorrent = mod.default || mod
    this.client = new WebTorrent()

    // Global client error handler
    this.client.on('error', (err: Error) => {
      console.error('[TorrentManager] Client error:', err.message)
    })

    this.initialized = true
    console.log('[TorrentManager] Initialized')
    console.log(`  Stream path:   ${this.streamPath}`)
    console.log(`  Download path: ${this.downloadPath}`)
  }

  /** Set the base URL for stream URLs (called after StreamServer starts). */
  setStreamBaseURL(url: string): void {
    this.streamBaseURL = url
  }

  // ─── Stream Path Cleanup ──────────────────────────────────────────

  /**
   * Wipe the entire ephemeral stream directory.
   * Called on app startup so no stale streaming data remains.
   */
  async wipeStreamCache(): Promise<void> {
    try {
      await fs.rm(this.streamPath, { recursive: true, force: true })
      await fs.mkdir(this.streamPath, { recursive: true })
      console.log('[TorrentManager] Stream cache wiped on startup')
    } catch (err) {
      console.warn('[TorrentManager] Failed to wipe stream cache:', err)
    }
  }

  /** Returns the stream cache directory path. */
  getStreamPath(): string {
    return this.streamPath
  }

  /** Returns the persistent download directory path. */
  getDownloadPath(): string {
    return this.downloadPath
  }

  // ─── Public API: Streaming (Ephemeral) ──────────────────────────────

  /**
   * Add a torrent in STREAM mode — ephemeral, sequential download for playback.
   * Temp files are cleaned when user leaves the player or restarts.
   */
  addTorrent(magnetURI: string): Promise<TorrentInfo> {
    return this._addTorrent(magnetURI, 'stream')
  }

  /**
   * Cleanup a stream torrent — destroys the torrent AND deletes its temp files.
   * Called when the user navigates away from the Player page.
   */
  async cleanupStream(infoHash: string): Promise<void> {
    const state = this.torrentStates.get(infoHash)
    if (!state || state.mode !== 'stream') return

    // Stop progress reporting
    if (state.progressTimer) {
      clearInterval(state.progressTimer)
    }
    this.torrentStates.delete(infoHash)

    const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
    if (torrent) {
      const torrentName = torrent.name
      await new Promise<void>((resolve) => {
        torrent.destroy({ destroyStore: true }, (err) => {
          if (err) {
            console.error(`[TorrentManager] Error cleaning up stream ${infoHash}:`, err.message)
          }
          resolve()
        })
      })

      // Also try to remove the torrent's directory from the stream path
      if (torrentName) {
        try {
          const torrentDir = path.join(this.streamPath, torrentName)
          await fs.rm(torrentDir, { recursive: true, force: true })
        } catch {
          // Ignore — may already be gone
        }
      }

      console.log(`[TorrentManager] Stream cleaned up: ${infoHash}`)
    }
  }

  /**
   * Returns info for all active STREAM-mode torrents.
   */
  getStreams(): TorrentInfo[] {
    return this.client.torrents
      .filter((t) => {
        const state = this.torrentStates.get(t.infoHash)
        return t.ready && state?.mode === 'stream'
      })
      .map((t) => this.buildTorrentInfo(t))
  }

  // ─── Public API: Downloads (Persistent) ────────────────────────────

  /**
   * Add a torrent in DOWNLOAD mode — persistent, full parallel download.
   * Files save to ~/Downloads/StreamForge/ and survive restarts.
   */
  addDownload(magnetURI: string): Promise<TorrentInfo> {
    return this._addTorrent(magnetURI, 'download')
  }

  /**
   * Returns info for all active DOWNLOAD-mode torrents.
   */
  getDownloads(): TorrentInfo[] {
    return this.client.torrents
      .filter((t) => {
        const state = this.torrentStates.get(t.infoHash)
        return t.ready && state?.mode === 'download'
      })
      .map((t) => this.buildTorrentInfo(t))
  }

  /**
   * Restore downloads from the manifest file after a restart.
   * Re-adds each torrent in download mode so they resume.
   */
  async restoreDownloads(): Promise<void> {
    try {
      const raw = await fs.readFile(this.downloadsManifestPath, 'utf-8')
      const entries: DownloadManifestEntry[] = JSON.parse(raw)
      console.log(`[TorrentManager] Restoring ${entries.length} download(s)...`)

      for (const entry of entries) {
        try {
          await this._addTorrent(entry.magnetURI, 'download')
          console.log(`  ✓ Restored: ${entry.name || entry.infoHash}`)
        } catch (err) {
          console.warn(`  ✗ Failed to restore ${entry.infoHash}:`, err)
        }
      }
    } catch {
      // No manifest file yet — that's fine
      console.log('[TorrentManager] No downloads to restore')
    }
  }

  /**
   * Save current download torrents to the manifest file for persistence.
   */
  private async saveDownloadManifest(): Promise<void> {
    const entries: DownloadManifestEntry[] = []

    for (const [infoHash, state] of this.torrentStates) {
      if (state.mode !== 'download') continue
      const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
      if (!torrent) continue

      entries.push({
        magnetURI: torrent.magnetURI,
        infoHash: torrent.infoHash,
        name: torrent.name || '',
        addedAt: Date.now()
      })
    }

    try {
      await fs.mkdir(path.dirname(this.downloadsManifestPath), { recursive: true })
      await fs.writeFile(this.downloadsManifestPath, JSON.stringify(entries, null, 2))
    } catch (err) {
      console.error('[TorrentManager] Failed to save download manifest:', err)
    }
  }

  // ─── Shared API ───────────────────────────────────────────────────

  /**
   * Remove and destroy a torrent by info hash.
   * For streams: destroys torrent + deletes temp files.
   * For downloads: destroys torrent but keeps files. Removes from manifest.
   */
  removeTorrent(infoHash: string): void {
    const state = this.torrentStates.get(infoHash)
    if (state?.progressTimer) {
      clearInterval(state.progressTimer)
    }

    const isDownload = state?.mode === 'download'
    this.torrentStates.delete(infoHash)

    const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
    if (torrent) {
      // For streams: destroyStore=true (delete temp files)
      // For downloads: destroyStore=false (keep the downloaded files)
      torrent.destroy({ destroyStore: !isDownload }, (err) => {
        if (err) {
          console.error(`[TorrentManager] Error destroying ${infoHash}:`, err.message)
        } else {
          console.log(`[TorrentManager] Removed torrent ${infoHash} (mode: ${state?.mode || 'unknown'})`)
        }
      })
    }

    // Update download manifest if it was a download
    if (isDownload) {
      this.saveDownloadManifest()
    }
  }

  /**
   * Returns info for ALL active torrents (both modes).
   */
  getTorrents(): TorrentInfo[] {
    return this.client.torrents
      .filter((t) => t.ready)
      .map((t) => this.buildTorrentInfo(t))
  }

  /**
   * Returns the stream URL for a torrent using the custom media:// protocol.
   */
  getStreamURL(infoHash: string): string {
    if (this.streamBaseURL) {
      return `${this.streamBaseURL}/stream/${infoHash}`
    }

    return `media://stream/${infoHash}`
  }

  /**
   * Select a specific file within a torrent for streaming.
   * Returns the updated stream URL.
   */
  selectFile(infoHash: string, fileIndex: number): string {
    const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
    if (!torrent) {
      throw new Error(`Torrent not found: ${infoHash}`)
    }

    if (fileIndex < 0 || fileIndex >= torrent.files.length) {
      throw new Error(`Invalid file index: ${fileIndex}`)
    }

    // Deselect all, select the new file
    torrent.files.forEach((f) => f.deselect())
    torrent.files[fileIndex].select()

    const state = this.torrentStates.get(infoHash)
    if (state) {
      state.selectedFileIndex = fileIndex
    }

    const baseURL = this.getStreamURL(infoHash)
    const separator = baseURL.includes('?') ? '&' : '?'

    // Force the renderer video element to reload when the selected file changes.
    return `${baseURL}${separator}fileIndex=${fileIndex}&t=${Date.now()}`
  }

  /**
   * Notify the torrent engine about a seek so it can reprioritize pieces.
   * `positionPercent` is a value between 0 and 1.
   */
  notifySeek(infoHash: string, positionPercent: number): void {
    const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
    if (!torrent) return

    const state = this.torrentStates.get(infoHash)
    if (!state) return

    const file = torrent.files[state.selectedFileIndex]
    if (!file) return

    const pieceLength = torrent.pieceLength
    const totalPieces = torrent.pieces.length
    const seekByte = Math.floor(file.length * Math.max(0, Math.min(1, positionPercent)))
    const seekPiece = Math.floor(seekByte / pieceLength)

    const windowSize = Math.min(50, Math.ceil(totalPieces * 0.05))
    const startPiece = Math.max(0, seekPiece - 2)
    const endPiece = Math.min(totalPieces - 1, seekPiece + windowSize)

    for (let i = startPiece; i <= endPiece; i++) {
      torrent.critical(i, i)
    }

    console.log(
      `[TorrentManager] Seek: ${infoHash} → ${Math.round(positionPercent * 100)}% ` +
        `(pieces ${startPiece}-${endPiece})`
    )
  }

  /**
   * Returns the WebTorrent File object for the selected file in a torrent.
   */
  getSelectedFile(infoHash: string): any {
    const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
    if (!torrent) return null

    const state = this.torrentStates.get(infoHash)
    if (!state) return null

    return torrent.files[state.selectedFileIndex] || null
  }

  /**
   * Returns the absolute disk path for the selected file in a torrent.
   * WebTorrent stores files at: <path>/<file.path>
   * This is needed by the transcoder to read the file directly.
   */
  getSelectedFileDiskPath(infoHash: string): string | null {
    const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
    if (!torrent) return null

    const state = this.torrentStates.get(infoHash)
    if (!state) return null

    const file = torrent.files[state.selectedFileIndex]
    if (!file) return null

    return path.join(torrent.path, file.path)
  }

  /**
   * Returns the WebTorrent File object for any file index in a torrent.
   */
  getFileByIndex(infoHash: string, fileIndex: number): any {
    const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
    if (!torrent) return null
    return torrent.files[fileIndex] || null
  }

  /**
   * Returns progress data for a specific torrent.
   */
  getTorrentProgress(infoHash: string): TorrentProgress | null {
    const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
    if (!torrent) return null

    return this.buildProgressData(torrent)
  }

  /**
   * Destroy the WebTorrent client and clean up all resources.
   * Saves download manifest before shutting down.
   */
  async destroy(): Promise<void> {
    // Save downloads so they can be restored on next launch
    await this.saveDownloadManifest()

    // Clear all progress timers
    for (const [, state] of this.torrentStates) {
      if (state.progressTimer) {
        clearInterval(state.progressTimer)
      }
    }
    this.torrentStates.clear()

    return new Promise((resolve) => {
      this.client.destroy((err) => {
        if (err) {
          console.error('[TorrentManager] Error during cleanup:', err.message)
        }
        console.log('[TorrentManager] Destroyed')
        resolve()
      })
    })
  }

  // ─── Core torrent add logic (shared by stream & download) ─────────

  private _addTorrent(magnetURI: string, mode: TorrentMode): Promise<TorrentInfo> {
    const targetPath = mode === 'stream' ? this.streamPath : this.downloadPath

    return new Promise((resolve, reject) => {
      // Extract info hash for robust duplicate detection
      const hashMatch = magnetURI.match(/btih:([a-fA-F0-9]{40})/i)
        || magnetURI.match(/btih:([a-zA-Z2-7]{32})/i)
      const incomingHash = hashMatch ? hashMatch[1].toLowerCase() : null

      // Prevent duplicate additions
      const existing = this.client.torrents.find((t) => {
        if (incomingHash && t.infoHash.toLowerCase() === incomingHash) return true
        if (t.magnetURI === magnetURI) return true
        if (magnetURI.includes(t.infoHash)) return true
        return false
      })

      if (existing) {
        if (existing.ready) {
          console.log(`[TorrentManager] Reusing existing torrent: ${existing.infoHash} (${mode})`)
          resolve(this.buildTorrentInfo(existing))
        } else {
          console.log(`[TorrentManager] Waiting for existing torrent: ${existing.infoHash}`)
          existing.once('ready', () => resolve(this.buildTorrentInfo(existing)))
          existing.once('error', (err) => reject(err))
        }
        return
      }

      let torrent: any
      try {
        torrent = this.client.add(magnetURI, { path: targetPath })
      } catch (err: any) {
        const msg = err?.message || String(err)
        if (msg.includes('duplicate') || msg.includes('Cannot add')) {
          const fallback = incomingHash
            ? this.client.torrents.find((t) => t.infoHash.toLowerCase() === incomingHash)
            : null
          if (fallback) {
            if (fallback.ready) {
              resolve(this.buildTorrentInfo(fallback))
            } else {
              fallback.once('ready', () => resolve(this.buildTorrentInfo(fallback)))
              fallback.once('error', (e) => reject(e))
            }
            return
          }
        }
        reject(err)
        return
      }

      torrent.on('ready', () => {
        // Stream mode: sequential for playback. Download mode: parallel for speed.
        if (mode === 'stream') {
          ;(torrent as any).sequential = true
        }

        console.log(`[TorrentManager] Torrent ready (${mode}): "${torrent.name}" (${torrent.files.length} files)`)
        torrent.files.forEach((f, i) => {
          console.log(`  [${i}] ${f.name} (${(f.length / 1024 / 1024).toFixed(1)} MB)`)
        })

        // Auto-select the largest video file
        const fileIndex = this.findLargestVideoFile(torrent)
        const selectedFile = torrent.files[fileIndex]
        console.log(`[TorrentManager] Selected file [${fileIndex}]: ${selectedFile?.name || 'NONE'}`)

        this.torrentStates.set(torrent.infoHash, {
          selectedFileIndex: fileIndex,
          progressTimer: null,
          mode
        })

        if (mode === 'stream') {
          // Stream: deselect all files, only download the selected one
          torrent.files.forEach((f) => f.deselect())
          if (fileIndex >= 0 && fileIndex < torrent.files.length) {
            torrent.files[fileIndex].select()
          }
        }
        // Download mode: let all files download (default WebTorrent behavior)

        const info = this.buildTorrentInfo(torrent)
        this.startProgressReporting(torrent)
        this.emit('torrent:ready', info)
        resolve(info)

        // Save manifest for downloads
        if (mode === 'download') {
          this.saveDownloadManifest()
        }
      })

      torrent.on('error', (err: Error) => {
        const errorInfo = {
          infoHash: torrent.infoHash || 'unknown',
          error: err.message
        }
        this.emit('torrent:error', errorInfo)
        reject(err)
      })

      torrent.on('warning', (warn: Error) => {
        console.warn(`[TorrentManager] Warning (${torrent.infoHash}):`, warn.message)
      })
    })
  }

  // ─── Private helpers ───────────────────────────────────────────────

  private findLargestVideoFile(torrent: any): number {
    let bestIndex = 0
    let bestSize = 0

    torrent.files.forEach((file, index) => {
      const ext = path.extname(file.name).toLowerCase()
      if (VIDEO_EXTENSIONS.has(ext) && file.length > bestSize) {
        bestSize = file.length
        bestIndex = index
      }
    })

    return bestIndex
  }

  private startProgressReporting(torrent: any): void {
    const state = this.torrentStates.get(torrent.infoHash)
    if (!state) return

    if (state.progressTimer) {
      clearInterval(state.progressTimer)
    }

    state.progressTimer = setInterval(() => {
      if (!torrent.ready) return

      const progress = this.buildProgressData(torrent)
      this.emit('torrent:progress', progress)

      // Stop reporting once fully downloaded
      if (torrent.progress >= 1) {
        if (state.progressTimer) {
          clearInterval(state.progressTimer)
          state.progressTimer = null
        }
      }
    }, 500)
  }

  private buildTorrentInfo(torrent: any): TorrentInfo {
    const state = this.torrentStates.get(torrent.infoHash)
    return {
      infoHash: torrent.infoHash,
      name: torrent.name,
      files: torrent.files.map((f) => ({
        name: f.name,
        path: f.path,
        size: f.length,
        type: path.extname(f.name).toLowerCase().replace('.', '')
      })),
      totalSize: torrent.length,
      streamURL: this.getStreamURL(torrent.infoHash),
      ready: torrent.ready,
      mode: state?.mode || 'stream'
    }
  }

  private buildProgressData(torrent: any): TorrentProgress {
    const state = this.torrentStates.get(torrent.infoHash)
    let bufferProgress = torrent.progress

    if (state && torrent.files[state.selectedFileIndex]) {
      const selectedFile = torrent.files[state.selectedFileIndex]
      bufferProgress = (selectedFile as any).progress ?? torrent.progress
    }

    return {
      infoHash: torrent.infoHash,
      progress: torrent.progress,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      numPeers: torrent.numPeers,
      downloaded: torrent.downloaded,
      uploaded: torrent.uploaded,
      totalSize: torrent.length,
      timeRemaining: torrent.timeRemaining,
      ratio: torrent.ratio,
      bufferProgress,
      mode: state?.mode || 'stream'
    }
  }
}
