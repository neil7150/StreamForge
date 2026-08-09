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

export interface TorrentAPI {
  // Streaming (ephemeral)
  addTorrent: (magnetURI: string) => Promise<TorrentInfo>
  getStreams: () => Promise<TorrentInfo[]>
  cleanupStream: (infoHash: string) => Promise<void>

  // Downloads (persistent)
  addDownload: (magnetURI: string) => Promise<TorrentInfo>
  getDownloads: () => Promise<TorrentInfo[]>
  openDownloadFolder: () => Promise<void>

  // Shared
  removeTorrent: (infoHash: string) => Promise<void>
  getTorrents: () => Promise<TorrentInfo[]>
  getStreamURL: (infoHash: string) => Promise<string>
  getMediaInfo: (infoHash: string) => Promise<MediaInfo | null>
  selectFile: (infoHash: string, fileIndex: number) => Promise<string>
  notifySeek: (infoHash: string, position: number) => Promise<void>
  updatePlaybackPosition: (infoHash: string, currentTime: number, duration: number) => Promise<void>

  // Events
  onTorrentProgress: (callback: (data: TorrentProgress) => void) => () => void
  onTorrentReady: (callback: (data: TorrentInfo) => void) => () => void
  onTorrentError: (callback: (data: { infoHash: string; error: string }) => void) => () => void

  // Search
  searchTorrents: (query: string) => Promise<TorrentSearchResponse>

  // Cache
  getCacheSize: () => Promise<number>
  clearCache: () => Promise<void>

  // Window
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  isMaximized: () => Promise<boolean>
  onWindowMaximized: (callback: (maximized: boolean) => void) => () => void
}

declare global {
  interface Window {
    torrentAPI: TorrentAPI
  }
}
