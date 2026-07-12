import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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

  selectFile: (infoHash: string, fileIndex: number): Promise<string> =>
    ipcRenderer.invoke('torrent:select-file', infoHash, fileIndex),

  notifySeek: (infoHash: string, position: number): Promise<void> =>
    ipcRenderer.invoke('torrent:seek', infoHash, position),

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
  searchNyaa: (query: string): Promise<any[]> =>
    ipcRenderer.invoke('search:nyaa', query),

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

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('torrentAPI', torrentAPI)
  } catch (error) {
    console.error('Failed to expose APIs:', error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.torrentAPI = torrentAPI
}
