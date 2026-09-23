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
import type { Readable } from 'node:stream'
import { app } from 'electron'
import { appendFallbackTrackers } from '../search/provider-policy'
import { findPreferredEpisodeFile, type PreferredEpisodeFile } from './episode-file-policy'
import {
  buildPeerConnectionDiagnostics,
  createPeerDiscoveryStats,
  recordPeerDiscovery,
  shouldRefreshPeerDiscovery,
  type PeerConnectionDiagnostics,
  type PeerDiscoveryStats
} from './peer-transport-policy'
import {
  calculateAdaptiveStartupBufferBytes,
  calculateMetadataTailPieceRange,
  calculateFullFilePieceRange,
  calculateStartupCriticalEndPiece,
  calculateStreamingLookaheadPieceRange,
  FALLBACK_STARTUP_BUFFER_BYTES
} from './stream-policy'

interface TorrentFileHandle {
  name: string
  path: string
  length: number
  progress?: number
  offset: number
  select(): void
  deselect(): void
  createReadStream(options: { start: number; end: number }): Readable
}

interface ManagedTorrent {
  infoHash: string
  magnetURI: string
  name: string
  path: string
  files: TorrentFileHandle[]
  ready: boolean
  length: number
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  numPeers: number
  downloaded: number
  uploaded: number
  timeRemaining: number
  ratio: number
  pieceLength: number
  pieces: unknown[]
  wires?: Array<{ type?: string }>
  _peers?: Map<string, { id?: string; type?: string; source?: string | null; retries?: number }>
  sequential?: boolean
  discovery?: {
    tracker?: { update(): void } | null
  } | null
  on(event: string, listener: (...args: any[]) => void): void
  once(event: string, listener: (...args: any[]) => void): void
  removeListener(event: string, listener: (...args: any[]) => void): void
  destroy(options: { destroyStore: boolean }, callback: (error?: Error) => void): void
  critical(start: number, end: number): void
  select(start: number, end: number, priority?: number): void
  deselect(start: number, end: number): void
}

interface TorrentClient {
  torrents: ManagedTorrent[]
  add(magnetURI: string, options: { path: string; deselect?: boolean; strategy?: 'sequential' | 'rarest' }): ManagedTorrent
  on(event: string, listener: (...args: any[]) => void): void
  destroy(callback: (error?: Error) => void): void
}

interface TorrentClientConstructor {
  new (options?: {
    utp?: boolean
    maxConns?: number
    tracker?: { getAnnounceOpts?: () => { numwant: number } }
  }): TorrentClient
}

// WebTorrent v2.x is ESM-only — must use dynamic import().
let WebTorrent: TorrentClientConstructor

// ─── Video file extensions we consider streamable ────────────────────
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.webm', '.mov', '.m4v',
  '.ts', '.ogv', '.flv', '.wmv', '.3gp', '.3g2', '.mpg', '.mpeg', '.m2ts',
  '.mts', '.divx', '.vob', '.rmvb', '.rm', '.asf'
])
const TAIL_METADATA_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov'])

function preferredEpisodeLabel(preferred: PreferredEpisodeFile): string {
  return preferred.absoluteEpisodeOnly && preferred.absoluteEpisodeNumber
    ? `EP ${String(preferred.absoluteEpisodeNumber).padStart(3, '0')}`
    : `S${String(preferred.seasonNumber).padStart(2, '0')}E${String(preferred.episodeNumber).padStart(2, '0')}`
}

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
  selectedFileIndex: number | null
  requiresFileSelection: boolean
  fileSelectionMessage: string | null
}

export interface QueuedDownloadResult {
  infoHash: string
  queued: boolean
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
  peerConnections: PeerConnectionDiagnostics
}

/** Tracks per-torrent state (selected file index, throttle timer, mode, etc.) */
interface TorrentState {
  selectedFileIndex: number
  requiresFileSelection: boolean
  fileSelectionMessage: string | null
  progressTimer: ReturnType<typeof setInterval> | null
  discoveryRefreshTimers: Array<ReturnType<typeof setTimeout>>
  mode: TorrentMode
  selectedPieceRange: { start: number; end: number } | null
  metadataPieceRange: { start: number; end: number } | null
  lookaheadPieceRange: { start: number; end: number } | null
  lastDownloaded: number
  lastProgressAt: number
  stallReported: boolean
  mediaDuration: number
}

/** Persisted download entry saved to downloads.json */
interface DownloadManifestEntry {
  magnetURI: string
  infoHash: string
  name: string
  addedAt: number
}

export class TorrentManager extends EventEmitter {
  private client!: TorrentClient
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
  /** Hashes deliberately stopped by the user; their late events are ignored. */
  private intentionallyRemoved: Set<string> = new Set()
  /** Mode requested while a torrent is still waiting for metadata. */
  private pendingModes: WeakMap<ManagedTorrent, TorrentMode> = new WeakMap()
  /** Downloads requested for a torrent that is currently reserved by the player. */
  private pendingDownloadMagnets: Map<string, string> = new Map()
  /** Requested episode while a potentially multi-file torrent is waiting for metadata. */
  private pendingEpisodeFiles: WeakMap<ManagedTorrent, PreferredEpisodeFile> = new WeakMap()
  /** Metadata deadlines keyed by info hash so removal can cancel them. */
  private metadataDeadlines: Map<string, ReturnType<typeof setTimeout>> = new Map()
  /** Cumulative discovery counters kept separately from WebTorrent's live wire list. */
  private peerDiscoveryStats: WeakMap<ManagedTorrent, PeerDiscoveryStats> = new WeakMap()
  /** Scheduled announces, including torrents that have not received metadata yet. */
  private discoveryRefreshTimers: WeakMap<ManagedTorrent, Array<ReturnType<typeof setTimeout>>> = new WeakMap()

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
    WebTorrent = (mod.default || mod) as TorrentClientConstructor
    // Keep both BitTorrent transports available. Per-peer fallback policy below
    // switches an unsuccessful uTP attempt to TCP after its first 5s timeout.
    this.client = new WebTorrent({
      utp: true,
      maxConns: 100,
      tracker: { getAnnounceOpts: () => ({ numwant: 120 }) }
    })

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
  addTorrent(magnetURI: string, preferredEpisode?: PreferredEpisodeFile): Promise<TorrentInfo> {
    return this._addTorrent(magnetURI, 'stream', preferredEpisode)
  }

  /**
   * Cleanup a stream torrent — destroys the torrent AND deletes its temp files.
   * Called when the user navigates away from the Player page.
   */
  async cleanupStream(infoHash: string): Promise<void> {
    const state = this.torrentStates.get(infoHash)
    if (state && state.mode !== 'stream') return

    this.suppressRemovalEvents(infoHash)
    this.clearMetadataDeadline(infoHash)
    if (state?.progressTimer) {
      clearInterval(state.progressTimer)
    }
    // Stop progress reporting
    this.torrentStates.delete(infoHash)

    const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
    this.clearDiscoveryRefreshTimers(state, torrent)
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

    const queuedMagnet = this.pendingDownloadMagnets.get(infoHash.toLowerCase())
    if (queuedMagnet) {
      this.pendingDownloadMagnets.delete(infoHash.toLowerCase())
      void this.addDownload(queuedMagnet).catch((error) => {
        console.error(`[TorrentManager] Failed to start queued download ${infoHash}:`, error)
      })
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

  /** Stops every ephemeral stream before its cache files are cleared. */
  async cleanupAllStreams(): Promise<void> {
    const hashes = this.client.torrents
      .filter((torrent) => {
        const mode = this.torrentStates.get(torrent.infoHash)?.mode
          ?? this.pendingModes.get(torrent)
        return mode === 'stream'
      })
      .map((torrent) => torrent.infoHash)
      .filter(Boolean)

    await Promise.all(hashes.map((infoHash) => this.cleanupStream(infoHash)))
  }

  /**
   * Add a torrent in DOWNLOAD mode — persistent, full parallel download.
   * Files save to ~/Downloads/StreamForge/ and survive restarts.
   */
  addDownload(magnetURI: string): Promise<TorrentInfo> {
    return this._addTorrent(magnetURI, 'download')
  }

  /**
   * Start a persistent download, or queue it until an active stream using the
   * same torrent releases WebTorrent's single-torrent reservation.
   */
  async queueDownload(magnetURI: string, activeStreamInfoHash?: string): Promise<QueuedDownloadResult> {
    const hashMatch = magnetURI.match(/btih:([a-fA-F0-9]{40})/i)
      || magnetURI.match(/btih:([a-zA-Z2-7]{32})/i)
    const requestedHash = activeStreamInfoHash?.toLowerCase() ?? hashMatch?.[1]?.toLowerCase()
    const activeStream = requestedHash
      ? this.client.torrents.find((torrent) => {
          if (torrent.infoHash.toLowerCase() !== requestedHash) return false
          return (this.torrentStates.get(torrent.infoHash)?.mode ?? this.pendingModes.get(torrent)) === 'stream'
        })
      : undefined

    if (requestedHash && activeStream) {
      this.pendingDownloadMagnets.set(requestedHash, magnetURI)
      return { infoHash: activeStream.infoHash, queued: true }
    }

    const info = await this.addDownload(magnetURI)
    return { infoHash: info.infoHash, queued: false }
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
  async removeTorrent(infoHash: string): Promise<void> {
    this.pendingDownloadMagnets.delete(infoHash.toLowerCase())
    this.suppressRemovalEvents(infoHash)
    this.clearMetadataDeadline(infoHash)
    const state = this.torrentStates.get(infoHash)
    if (state?.progressTimer) clearInterval(state.progressTimer)
    const isDownload = state?.mode === 'download'
    this.torrentStates.delete(infoHash)

    const torrent = this.client.torrents.find((candidate) => candidate.infoHash === infoHash)
    this.clearDiscoveryRefreshTimers(state, torrent)
    if (torrent) {
      const torrentName = torrent.name
      await new Promise<void>((resolve) => {
        torrent.destroy({ destroyStore: !isDownload }, (error) => {
          if (error) {
            console.error(`[TorrentManager] Error destroying ${infoHash}:`, error.message)
          } else {
            console.log(`[TorrentManager] Removed torrent ${infoHash} (mode: ${state?.mode || 'unknown'})`)
          }
          resolve()
        })
      })

      if (!isDownload && torrentName) {
        try {
          await fs.rm(path.join(this.streamPath, torrentName), { recursive: true, force: true })
        } catch {
          // The temporary stream directory may already have been removed.
        }
      }
    }

    if (isDownload) await this.saveDownloadManifest()
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
    return `media://stream/${infoHash}`
  }

  /**
   * Select a specific file within a torrent for streaming.
   * Returns the updated stream URL.
   */
  selectFile(infoHash: string, fileIndex: number): string {
    if (!Number.isInteger(fileIndex)) {
      throw new Error('File index must be an integer')
    }
    const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
    if (!torrent) throw new Error(`Torrent not found: ${infoHash}`)
    if (fileIndex < 0 || fileIndex >= torrent.files.length) {
      throw new Error(`Invalid file index: ${fileIndex}`)
    }

    const state = this.torrentStates.get(infoHash)
    if (state) {
      state.selectedFileIndex = fileIndex
      state.requiresFileSelection = false
      state.fileSelectionMessage = null
      if (state.mode === 'stream') {
        this.selectStreamFile(torrent, state, fileIndex, 0, FALLBACK_STARTUP_BUFFER_BYTES)
      }
    }

    const baseURL = this.getStreamURL(infoHash)
    const separator = baseURL.includes('?') ? '&' : '?'
    return `${baseURL}${separator}fileIndex=${fileIndex}&t=${Date.now()}`
  }

  /** Keep the whole selected video downloading while prioritizing the playhead. */
  updatePlaybackPosition(infoHash: string, currentTime: number, duration: number): void {
    const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
    const state = this.torrentStates.get(infoHash)
    if (
      !torrent
      || !state
      || state.mode !== 'stream'
      || !Number.isFinite(currentTime)
      || !Number.isFinite(duration)
      || duration <= 0
    ) return

    const file = torrent.files[state.selectedFileIndex]
    if (!file || file.length <= 0) return

    state.mediaDuration = duration
    const bytesPerSecond = file.length / duration
    const playheadByte = Math.floor(Math.max(0, Math.min(duration, currentTime)) * bytesPerSecond)
    const priorityBytes = calculateAdaptiveStartupBufferBytes(torrent.downloadSpeed, bytesPerSecond)
    const lookahead = calculateStreamingLookaheadPieceRange(
      file.offset,
      file.length,
      torrent.pieceLength,
      playheadByte,
      bytesPerSecond,
      45
    )
    this.updateLookaheadRange(torrent, state, lookahead)

    this.selectStreamFile(
      torrent,
      state,
      state.selectedFileIndex,
      Math.max(0, playheadByte - priorityBytes / 4),
      Math.min(file.length - 1, playheadByte + priorityBytes),
      playheadByte
    )
  }

  /** Prioritize bytes being consumed by FFmpeg without cancelling the full download. */
  updateStreamBytePosition(infoHash: string, currentByte: number, duration: number): void {
    const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
    const state = this.torrentStates.get(infoHash)
    if (!torrent || !state || state.mode !== 'stream' || !Number.isFinite(currentByte)) return

    const file = torrent.files[state.selectedFileIndex]
    if (!file || file.length <= 0) return

    const safeByte = Math.max(0, Math.min(file.length - 1, Math.floor(currentByte)))
    const bytesPerSecond = Number.isFinite(duration) && duration > 0
      ? file.length / duration
      : undefined
    const priorityBytes = calculateAdaptiveStartupBufferBytes(torrent.downloadSpeed, bytesPerSecond)
    const lookahead = calculateStreamingLookaheadPieceRange(
      file.offset,
      file.length,
      torrent.pieceLength,
      safeByte,
      bytesPerSecond,
      45
    )
    this.updateLookaheadRange(torrent, state, lookahead)

    this.selectStreamFile(
      torrent,
      state,
      state.selectedFileIndex,
      Math.max(0, safeByte - priorityBytes / 4),
      Math.min(file.length - 1, safeByte + priorityBytes),
      safeByte
    )
  }

  /** Apply bitrate-aware startup priority as soon as FFprobe knows the duration. */
  configureStreamMedia(infoHash: string, duration: number): void {
    if (!Number.isFinite(duration) || duration <= 0) return
    const torrent = this.client.torrents.find((candidate) => candidate.infoHash === infoHash)
    const state = this.torrentStates.get(infoHash)
    if (!torrent || !state || state.mode !== 'stream') return
    const file = torrent.files[state.selectedFileIndex]
    if (!file || file.length <= 0) return

    const hadDuration = state.mediaDuration > 0
    state.mediaDuration = duration
    const firstFilePiece = Math.floor(file.offset / torrent.pieceLength)
    if (hadDuration || state.selectedPieceRange?.start !== firstFilePiece) return

    const bytesPerSecond = file.length / duration
    const startupBytes = calculateAdaptiveStartupBufferBytes(torrent.downloadSpeed, bytesPerSecond)
    this.selectStreamFile(torrent, state, state.selectedFileIndex, 0, startupBytes)
  }

  /** Briefly prioritize container metadata near the end of MP4-style files. */
  prioritizeStreamMetadata(infoHash: string): void {
    const torrent = this.client.torrents.find((candidate) => candidate.infoHash === infoHash)
    const state = this.torrentStates.get(infoHash)
    if (!torrent || !state || state.mode !== 'stream' || state.metadataPieceRange) return
    const file = torrent.files[state.selectedFileIndex]
    if (!file) return
    if (!TAIL_METADATA_EXTENSIONS.has(path.extname(file.name).toLowerCase())) return

    const range = calculateMetadataTailPieceRange(
      file.offset,
      file.length,
      torrent.pieceLength
    )
    if (!range) return
    torrent.select(range.start, range.end, 5)
    torrent.critical(range.start, range.start)
    state.metadataPieceRange = range
  }

  /** Stop requesting the temporary metadata tail after probing completes. */
  releaseStreamMetadata(infoHash: string): void {
    const torrent = this.client.torrents.find((candidate) => candidate.infoHash === infoHash)
    const state = this.torrentStates.get(infoHash)
    if (!torrent || !state?.metadataPieceRange) return
    torrent.deselect(state.metadataPieceRange.start, state.metadataPieceRange.end)
    state.metadataPieceRange = null
  }

  /** Prioritize a seek immediately until the next playback update arrives. */
  notifySeek(infoHash: string, positionPercent: number): void {
    if (!Number.isFinite(positionPercent)) return
    const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
    const state = this.torrentStates.get(infoHash)
    if (!torrent || !state || state.mode !== 'stream') return

    const file = torrent.files[state.selectedFileIndex]
    if (!file) return

    const seekByte = Math.floor(file.length * Math.max(0, Math.min(1, positionPercent)))
    const bytesPerSecond = state.mediaDuration > 0 ? file.length / state.mediaDuration : undefined
    const startupBytes = calculateAdaptiveStartupBufferBytes(torrent.downloadSpeed, bytesPerSecond)
    const lookahead = calculateStreamingLookaheadPieceRange(
      file.offset,
      file.length,
      torrent.pieceLength,
      seekByte,
      bytesPerSecond,
      45
    )
    this.updateLookaheadRange(torrent, state, lookahead)

    this.selectStreamFile(
      torrent,
      state,
      state.selectedFileIndex,
      Math.max(0, seekByte - startupBytes / 4),
      Math.min(file.length - 1, seekByte + startupBytes),
      seekByte
    )
  }
  /** Returns the WebTorrent File object for the selected file in a torrent. */
  getSelectedFile(infoHash: string): TorrentFileHandle | null {
    const torrent = this.client.torrents.find((t) => t.infoHash === infoHash)
    const state = this.torrentStates.get(infoHash)
    if (!torrent || !state) return null
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
    if (!state || state.mode === 'stream') return null

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
      this.clearDiscoveryRefreshTimers(state)
    }
    for (const torrent of this.client.torrents) {
      this.clearDiscoveryRefreshTimers(undefined, torrent)
    }
    this.torrentStates.clear()

    for (const timer of this.metadataDeadlines.values()) {
      clearTimeout(timer)
    }
    this.metadataDeadlines.clear()
    this.pendingDownloadMagnets.clear()

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

  private _addTorrent(
    magnetURI: string,
    mode: TorrentMode,
    preferredEpisode?: PreferredEpisodeFile
  ): Promise<TorrentInfo> {
    if (!magnetURI.startsWith('magnet:?') || magnetURI.length > 16_384) {
      return Promise.reject(new Error('Invalid magnet URI'))
    }
    magnetURI = appendFallbackTrackers(magnetURI)
    if (magnetURI.length > 16_384) {
      return Promise.reject(new Error('Magnet URI is too long'))
    }

    const targetPath = mode === 'stream' ? this.streamPath : this.downloadPath

    return new Promise((resolve, reject) => {
      // Extract info hash for robust duplicate detection
      const hashMatch = magnetURI.match(/btih:([a-fA-F0-9]{40})/i)
        || magnetURI.match(/btih:([a-zA-Z2-7]{32})/i)
      const incomingHash = hashMatch ? hashMatch[1].toLowerCase() : null

      const waitForExistingTorrent = (candidate: ManagedTorrent): void => {
        if (preferredEpisode) this.pendingEpisodeFiles.set(candidate, preferredEpisode)
        if (candidate.ready) {
          console.log(`[TorrentManager] Reusing existing torrent: ${candidate.infoHash} (${mode})`)
          if (preferredEpisode) this.applyPreferredEpisodeSelection(candidate, preferredEpisode)
          resolve(this.buildTorrentInfo(candidate))
          return
        }

        let settled = false
        const cleanup = () => {
          candidate.removeListener('ready', onReady)
          candidate.removeListener('error', onError)
          candidate.removeListener('close', onClose)
        }
        const onReady = () => {
          if (settled) return
          settled = true
          cleanup()
          if (preferredEpisode) this.applyPreferredEpisodeSelection(candidate, preferredEpisode)
          resolve(this.buildTorrentInfo(candidate))
        }
        const onError = (error: Error) => {
          if (settled) return
          settled = true
          cleanup()
          reject(error)
        }
        const onClose = () => {
          if (settled) return
          settled = true
          cleanup()
          const hash = candidate.infoHash || incomingHash || ''
          reject(new Error(
            hash && this.intentionallyRemoved.has(hash)
              ? 'STREAM_CANCELLED'
              : 'Torrent closed before metadata became ready'
          ))
        }

        console.log(`[TorrentManager] Waiting for existing torrent: ${candidate.infoHash || incomingHash || 'pending'}`)
        candidate.once('ready', onReady)
        candidate.once('error', onError)
        candidate.once('close', onClose)
        if (candidate.ready) onReady()
      }

      // Prevent duplicate additions
      const existing = this.client.torrents.find((t) => {
        if (incomingHash && t.infoHash.toLowerCase() === incomingHash) return true
        if (t.magnetURI === magnetURI) return true
        if (magnetURI.includes(t.infoHash)) return true
        return false
      })

      if (existing) {
        const existingMode = this.torrentStates.get(existing.infoHash)?.mode
          ?? this.pendingModes.get(existing)
        if (existingMode && existingMode !== mode) {
          reject(new Error(
            'Torrent is already active in ' + existingMode
              + ' mode. Remove it before adding it in ' + mode + ' mode.'
          ))
          return
        }
        waitForExistingTorrent(existing)
        return
      }

      let torrent: ManagedTorrent
      try {
        const options = mode === 'stream'
          ? {
              path: targetPath,
              deselect: true,
              strategy: 'sequential' as const
            }
          : { path: targetPath }
        torrent = this.client.add(magnetURI, options)
        this.pendingModes.set(torrent, mode)
        if (preferredEpisode) this.pendingEpisodeFiles.set(torrent, preferredEpisode)
        this.peerDiscoveryStats.set(torrent, createPeerDiscoveryStats())
      } catch (err: any) {
        const msg = err?.message || String(err)
        if (msg.includes('duplicate') || msg.includes('Cannot add')) {
          const fallback = incomingHash
            ? this.client.torrents.find((t) => t.infoHash.toLowerCase() === incomingHash)
            : null
          if (fallback) {
            const fallbackMode = this.torrentStates.get(fallback.infoHash)?.mode
              ?? this.pendingModes.get(fallback)
            if (fallbackMode && fallbackMode !== mode) {
              reject(new Error(
                'Torrent is already active in ' + fallbackMode
                  + ' mode. Remove it before adding it in ' + mode + ' mode.'
              ))
              return
            }
            waitForExistingTorrent(fallback)
            return
          }
        }
        reject(err)
        return
      }

      let discoveredPeerCount = 0
      const discoveryRefreshTimers: Array<ReturnType<typeof setTimeout>> = []
      this.discoveryRefreshTimers.set(torrent, discoveryRefreshTimers)
      const clearDiscoveryRefreshTimers = (): void => {
        for (const timer of discoveryRefreshTimers) clearTimeout(timer)
        discoveryRefreshTimers.length = 0
      }
      const refreshDiscovery = (): void => {
        if (torrent.ready) {
          const diagnostics = buildPeerConnectionDiagnostics(
            torrent,
            this.peerDiscoveryStats.get(torrent)
          )
          if (!shouldRefreshPeerDiscovery({
            connected: diagnostics.connected,
            pending: diagnostics.pending
          })) return
        }
        try {
          const tracker = torrent.discovery?.tracker
          if (!tracker) return
          tracker.update()
          console.log(`[TorrentManager] Refreshed tracker discovery: ${torrent.infoHash || incomingHash || 'unknown'} (${torrent.numPeers} connected)`)
        } catch (error) {
          console.warn('[TorrentManager] Tracker refresh failed:', error)
        }
      }
      if (mode === 'stream') {
        discoveryRefreshTimers.push(setTimeout(refreshDiscovery, 10_000))
        discoveryRefreshTimers.push(setTimeout(refreshDiscovery, 25_000))
        discoveryRefreshTimers.push(setTimeout(refreshDiscovery, 60_000))
        discoveryRefreshTimers.push(setTimeout(refreshDiscovery, 120_000))
      }

      const metadataDeadline = mode === 'stream'
        ? setTimeout(() => {
            if (torrent.ready) return
            clearDiscoveryRefreshTimers()
            this.clearMetadataDeadline(torrent.infoHash || incomingHash)
            const error = new Error(
              discoveredPeerCount === 0
                ? 'No reachable peers were found within 45 seconds. The displayed seed count may be stale; try another source or network.'
                : torrent.numPeers === 0
                  ? `Found ${discoveredPeerCount} peer address${discoveredPeerCount === 1 ? '' : 'es'}, but none completed a connection. Try another source or network.`
                  : `Connected to ${torrent.numPeers} peer${torrent.numPeers === 1 ? '' : 's'}, but none supplied torrent metadata. Try another source.`
            )
            console.warn(`[TorrentManager] Metadata timeout: ${torrent.infoHash || 'unknown'}`)
            this.emit('torrent:error', { infoHash: torrent.infoHash || incomingHash || 'unknown', error: error.message })
            torrent.destroy({ destroyStore: true }, () => {})
            reject(error)
          }, 45_000)
        : null
      if (metadataDeadline) {
        this.setMetadataDeadline(torrent.infoHash || incomingHash, metadataDeadline)
      }

      torrent.on('peer', (peer) => {
        discoveredPeerCount += 1
        const discovery = this.peerDiscoveryStats.get(torrent)
        if (discovery) recordPeerDiscovery(discovery, torrent, peer)
      })
      torrent.on('ready', () => {
        if (metadataDeadline) clearTimeout(metadataDeadline)
        this.clearMetadataDeadline(torrent.infoHash || incomingHash)
        // Stream mode: sequential for playback. Download mode: parallel for speed.
        if (mode === 'stream') {
          ;(torrent as any).sequential = true
        }

        console.log(`[TorrentManager] Torrent ready (${mode}): "${torrent.name}" (${torrent.files.length} files)`)

        const requestedEpisode = this.pendingEpisodeFiles.get(torrent)
        const episodeMatch = requestedEpisode
          ? findPreferredEpisodeFile(torrent.files, requestedEpisode)
          : null
        const fileIndex = episodeMatch?.status === 'matched'
          ? episodeMatch.fileIndex!
          : this.findLargestVideoFile(torrent)
        const requiresFileSelection = Boolean(requestedEpisode && episodeMatch?.status !== 'matched')
        const fileSelectionMessage = episodeMatch?.status === 'ambiguous'
          ? `Multiple files match ${preferredEpisodeLabel(requestedEpisode!)}. Choose the correct file.`
          : episodeMatch?.status === 'not-found'
            ? `This torrent did not identify the requested episode in its file names. Choose the correct file.`
            : null
        this.pendingEpisodeFiles.delete(torrent)
        const selectedFile = torrent.files[fileIndex]
        console.log(`[TorrentManager] ${requiresFileSelection ? 'Awaiting file choice; fallback' : 'Selected file'} [${fileIndex}]: ${selectedFile?.name || 'NONE'}`)

        const state: TorrentState = {
          selectedFileIndex: fileIndex,
          requiresFileSelection,
          fileSelectionMessage,
          progressTimer: null,
          discoveryRefreshTimers,
          mode,
          selectedPieceRange: null,
          metadataPieceRange: null,
          lookaheadPieceRange: null,
          lastDownloaded: torrent.downloaded,
          lastProgressAt: Date.now(),
          stallReported: false,
          mediaDuration: 0
        }
        this.torrentStates.set(torrent.infoHash, state)

        if (mode === 'stream' && !requiresFileSelection && fileIndex >= 0 && fileIndex < torrent.files.length) {
          this.selectStreamFile(torrent, state, fileIndex, 0, FALLBACK_STARTUP_BUFFER_BYTES)
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
        clearDiscoveryRefreshTimers()
        if (metadataDeadline) clearTimeout(metadataDeadline)
        this.clearMetadataDeadline(torrent.infoHash || incomingHash)
        if (this.intentionallyRemoved.has(torrent.infoHash)) return
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

      torrent.once('close', () => {
        clearDiscoveryRefreshTimers()
        if (metadataDeadline) clearTimeout(metadataDeadline)
        this.clearMetadataDeadline(torrent.infoHash || incomingHash)
        if (this.intentionallyRemoved.has(torrent.infoHash)) {
          reject(new Error('STREAM_CANCELLED'))
        }
      })
    })
  }

  // ─── Private helpers ───────────────────────────────────────────────

  private suppressRemovalEvents(infoHash: string): void {
    this.intentionallyRemoved.add(infoHash)
    setTimeout(() => this.intentionallyRemoved.delete(infoHash), 5_000)
  }

  private setMetadataDeadline(infoHash: string | null, timer: ReturnType<typeof setTimeout>): void {
    if (!infoHash) return
    const key = infoHash.toLowerCase()
    this.clearMetadataDeadline(key)
    this.metadataDeadlines.set(key, timer)
  }

  private clearMetadataDeadline(infoHash: string | null): void {
    if (!infoHash) return
    const key = infoHash.toLowerCase()
    const timer = this.metadataDeadlines.get(key)
    if (timer) clearTimeout(timer)
    this.metadataDeadlines.delete(key)
  }

  /**
   * Safely update the lookahead piece range, deselecting the old one first.
   * Without this, successive calls from each timeupdate event would accumulate
   * piece selections and cause WebTorrent to over-fetch indefinitely.
   */
  private updateLookaheadRange(
    torrent: ManagedTorrent,
    state: TorrentState,
    newRange: { start: number; end: number } | null
  ): void {
    const old = state.lookaheadPieceRange
    if (old && (!newRange || old.start !== newRange.start || old.end !== newRange.end)) {
      torrent.deselect(old.start, old.end)
    }
    if (newRange) {
      torrent.select(newRange.start, newRange.end, 8)
    }
    state.lookaheadPieceRange = newRange
  }

  /** Select the complete video once; subsequent calls only move urgent priority. */
  private selectStreamFile(
    torrent: ManagedTorrent,
    state: TorrentState,
    fileIndex: number,
    startByte: number,
    endByte: number,
    criticalStartByte: number = startByte
  ): void {
    const file = torrent.files[fileIndex]
    if (!file || file.length <= 0) return

    const from = Math.max(0, Math.min(file.length - 1, Math.floor(startByte)))
    const to = Math.max(from, Math.min(file.length - 1, Math.ceil(endByte)))
    const fullRange = calculateFullFilePieceRange(file.offset, file.length, torrent.pieceLength)
    if (!fullRange) return
    const { start: startPiece, end: endPiece } = fullRange
    const criticalFrom = Math.max(from, Math.min(to, Math.floor(criticalStartByte)))
    const criticalStartPiece = Math.floor((file.offset + criticalFrom) / torrent.pieceLength)
    const priorityEndPiece = Math.floor((file.offset + to) / torrent.pieceLength)

    if (state.selectedPieceRange?.start === startPiece && state.selectedPieceRange.end === endPiece) {
      torrent.critical(
        criticalStartPiece,
        calculateStartupCriticalEndPiece(criticalStartPiece, priorityEndPiece, torrent.pieceLength)
      )
      return
    }
    if (state.selectedPieceRange) torrent.deselect(state.selectedPieceRange.start, state.selectedPieceRange.end)

    torrent.select(startPiece, endPiece, 10)
    torrent.critical(
      criticalStartPiece,
      calculateStartupCriticalEndPiece(criticalStartPiece, priorityEndPiece, torrent.pieceLength)
    )
    state.selectedPieceRange = { start: startPiece, end: endPiece }
  }
  private findLargestVideoFile(torrent: ManagedTorrent): number {
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

  private applyPreferredEpisodeSelection(
    torrent: ManagedTorrent,
    preferredEpisode: PreferredEpisodeFile
  ): void {
    const state = this.torrentStates.get(torrent.infoHash)
    if (!state || state.mode !== 'stream') return

    const match = findPreferredEpisodeFile(torrent.files, preferredEpisode)
    if (match.status === 'matched' && match.fileIndex !== null) {
      state.selectedFileIndex = match.fileIndex
      state.requiresFileSelection = false
      state.fileSelectionMessage = null
      this.selectStreamFile(torrent, state, match.fileIndex, 0, FALLBACK_STARTUP_BUFFER_BYTES)
      return
    }

    if (state.selectedPieceRange) {
      torrent.deselect(state.selectedPieceRange.start, state.selectedPieceRange.end)
      state.selectedPieceRange = null
    }
    state.requiresFileSelection = true
    state.fileSelectionMessage = match.status === 'ambiguous'
      ? `Multiple files match ${preferredEpisodeLabel(preferredEpisode)}. Choose the correct file.`
      : 'This torrent did not identify the requested episode in its file names. Choose the correct file.'
  }

  private clearDiscoveryRefreshTimers(
    state?: TorrentState,
    torrent?: ManagedTorrent
  ): void {
    const timers = state?.discoveryRefreshTimers
      ?? (torrent ? this.discoveryRefreshTimers.get(torrent) : undefined)
    if (timers) {
      for (const timer of timers) clearTimeout(timer)
      timers.length = 0
    }
    if (torrent) this.discoveryRefreshTimers.delete(torrent)
  }

  private startProgressReporting(torrent: ManagedTorrent): void {
    const state = this.torrentStates.get(torrent.infoHash)
    if (!state) return

    if (state.progressTimer) {
      clearInterval(state.progressTimer)
    }

    state.progressTimer = setInterval(() => {
      if (!torrent.ready || !this.torrentStates.has(torrent.infoHash)) return

      const progress = this.buildProgressData(torrent)
      this.emit('torrent:progress', progress)

      if (torrent.downloaded > state.lastDownloaded) {
        state.lastDownloaded = torrent.downloaded
        state.lastProgressAt = Date.now()
        state.stallReported = false
      } else if (
        state.mode === 'stream' &&
        !state.requiresFileSelection &&
        torrent.numPeers > 0 &&
        Date.now() - state.lastProgressAt >= 30_000 &&
        !state.stallReported
      ) {
        state.stallReported = true
        const error = 'Stream stalled for 30 seconds despite connected peers. Retry the stream or choose another source.'
        console.warn(`[TorrentManager] ${error} (${torrent.infoHash})`)
        this.emit('torrent:error', { infoHash: torrent.infoHash, error })
      }

      // Both persistent and temporary full-file downloads stop polling at 100%.
      if (torrent.progress >= 1) {
        if (state.progressTimer) {
          clearInterval(state.progressTimer)
          state.progressTimer = null
        }
      }
    }, 500)
  }

  private buildTorrentInfo(torrent: ManagedTorrent): TorrentInfo {
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
      mode: state?.mode || 'stream',
      selectedFileIndex: state?.selectedFileIndex ?? null,
      requiresFileSelection: state?.requiresFileSelection ?? false,
      fileSelectionMessage: state?.fileSelectionMessage ?? null
    }
  }

  private buildProgressData(torrent: ManagedTorrent): TorrentProgress {
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
      mode: state?.mode || 'stream',
      peerConnections: buildPeerConnectionDiagnostics(
        torrent,
        this.peerDiscoveryStats.get(torrent)
      )
    }
  }
}
