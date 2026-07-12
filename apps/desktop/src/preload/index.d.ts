import { ElectronAPI } from '@electron-toolkit/preload'

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
  selectFile: (infoHash: string, fileIndex: number) => Promise<string>
  notifySeek: (infoHash: string, position: number) => Promise<void>

  // Events
  onTorrentProgress: (callback: (data: TorrentProgress) => void) => () => void
  onTorrentReady: (callback: (data: TorrentInfo) => void) => () => void
  onTorrentError: (callback: (data: { infoHash: string; error: string }) => void) => () => void

  // Search
  searchNyaa: (query: string) => Promise<any[]>

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
    electron: ElectronAPI
    torrentAPI: TorrentAPI
  }
}
