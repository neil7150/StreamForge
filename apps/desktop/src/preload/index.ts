import { contextBridge, ipcRenderer } from 'electron'

// Custom API exposed to renderer via contextBridge
const torrentAPI = {
  // ─── Streaming (ephemeral) ───────────────────────────────────────
  addTorrent: (magnetURI: string): Promise<TorrentInfo> =>
    ipcRenderer.invoke('torrent:add', magnetURI),

  getStreams: (): Promise<TorrentInfo[]> =>
    ipcRenderer.invoke('torrent:get-streams'),

  cleanupStream: (infoHash: string): Promise<void> =>
    ipcRenderer.invoke('torrent:cleanup-stream', infoHash),

  // ─── Downloads (persistent) ──────────────────────────────────────
  addDownload: (magnetURI: string): Promise<TorrentInfo> =>
    ipcRenderer.invoke('torrent:add-download', magnetURI),

  getDownloads: (): Promise<TorrentInfo[]> =>
    ipcRenderer.invoke('torrent:get-downloads'),

  openDownloadFolder: (): Promise<void> =>
    ipcRenderer.invoke('torrent:open-download-folder'),

  // ─── Shared ──────────────────────────────────────────────────────
  removeTorrent: (infoHash: string): Promise<void> =>
    ipcRenderer.invoke('torrent:remove', infoHash),

  getTorrents: (): Promise<TorrentInfo[]> =>
    ipcRenderer.invoke('torrent:get-all'),

  getStreamURL: (infoHash: string): Promise<string> =>
    ipcRenderer.invoke('torrent:stream-url', infoHash),

  getMediaInfo: (infoHash: string): Promise<MediaInfo | null> =>
    ipcRenderer.invoke('torrent:media-info', infoHash),

  selectFile: (infoHash: string, fileIndex: number): Promise<string> =>
    ipcRenderer.invoke('torrent:select-file', infoHash, fileIndex),

  notifySeek: (infoHash: string, position: number): Promise<void> =>
    ipcRenderer.invoke('torrent:seek', infoHash, position),

  updatePlaybackPosition: (infoHash: string, currentTime: number, duration: number): Promise<void> =>
    ipcRenderer.invoke('torrent:playback-position', infoHash, currentTime, duration),

  // ─── Events ──────────────────────────────────────────────────────
  onTorrentProgress: (callback: (data: TorrentProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TorrentProgress): void => callback(data)
    ipcRenderer.on('torrent:progress', handler)
    return () => ipcRenderer.removeListener('torrent:progress', handler)
  },

  onTorrentReady: (callback: (data: TorrentInfo) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TorrentInfo): void => callback(data)
    ipcRenderer.on('torrent:ready', handler)
    return () => ipcRenderer.removeListener('torrent:ready', handler)
  },

  onTorrentError: (callback: (data: { infoHash: string; error: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { infoHash: string; error: string }): void => callback(data)
    ipcRenderer.on('torrent:error', handler)
    return () => ipcRenderer.removeListener('torrent:error', handler)
  },

  // ─── Search ──────────────────────────────────────────────────────
  searchTorrents: (query: string): Promise<TorrentSearchResponse> =>
    ipcRenderer.invoke('search:torrents', query),

  // ─── Cache management ────────────────────────────────────────────
  getCacheSize: (): Promise<number> =>
    ipcRenderer.invoke('cache:get-size'),

  clearCache: (): Promise<void> =>
    ipcRenderer.invoke('cache:clear'),

  // ─── Window controls ─────────────────────────────────────────────
  minimizeWindow: (): void => ipcRenderer.send('window:minimize'),
  maximizeWindow: (): void => ipcRenderer.send('window:maximize'),
  closeWindow: (): void => ipcRenderer.send('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),

  onWindowMaximized: (callback: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean): void => callback(maximized)
    ipcRenderer.on('window:maximized-change', handler)
    return () => ipcRenderer.removeListener('window:maximized-change', handler)
  }
}

// Type definitions for IPC data
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

export interface MediaAudioTrack {
  index: number
  codec: string
  language: string
  title: string | null
  channels: number
  channelLayout: string | null
  isDefault: boolean
}

export interface MediaSubtitleTrack {
  index: number
  codec: string
  language: string
  title: string | null
  isDefault: boolean
  textBased: boolean
}

export interface MediaInfo {
  videoCodec: string | null
  audioCodec: string | null
  audioTracks: MediaAudioTrack[]
  subtitleTracks: MediaSubtitleTrack[]
  duration: number
  width: number
  height: number
  needsVideoTranscode: boolean
  needsAudioTranscode: boolean
  needsTranscode: boolean
}

export type TorrentProviderName = 'APIBay' | 'Nyaa' | 'YTS'

export interface TorrentSearchResult {
  id: string
  name: string
  magnetURI: string
  seeders: number
  leechers: number
  size: string
  sizeBytes: number
  category: string
  added: string
  provider: TorrentProviderName
  qualityScore?: number
}

export interface TorrentProviderStatus {
  name: TorrentProviderName
  status: 'ok' | 'error' | 'cooldown'
  count: number
  error?: string
  latencyMs?: number
  consecutiveFailures?: number
  retryAt?: number
  fromCache?: boolean
}

export interface TorrentSearchResponse {
  results: TorrentSearchResult[]
  providers: TorrentProviderStatus[]
  cache?: 'miss' | 'fresh' | 'stale'
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

export interface PeerConnectionDiagnostics {
  discovered: number
  pending: number
  connected: number
  fastTcpFallbacksArmed: number
  bySource: Record<'tracker' | 'dht' | 'lsd' | 'pex' | 'manual' | 'unknown', number>
  byTransport: Record<'tcp' | 'utp' | 'webrtc' | 'webseed' | 'unknown', number>
}

// Expose only the narrow, explicitly defined application API.
contextBridge.exposeInMainWorld('torrentAPI', torrentAPI)
