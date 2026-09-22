import type { TorrentAPI } from '../types/torrent'

let activeTorrentAPI: TorrentAPI | null = null

export function getTorrentAPI(): TorrentAPI {
  if (activeTorrentAPI) {
    return activeTorrentAPI
  }
  const win = (globalThis as any).window
  if (win && win.torrentAPI) {
    return win.torrentAPI as TorrentAPI
  }
  throw new Error('TorrentAPI is not initialized. Call setTorrentAPI(...) before using torrent services.')
}

export function setTorrentAPI(api: TorrentAPI): void {
  activeTorrentAPI = api
}
