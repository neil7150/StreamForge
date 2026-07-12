import { create } from 'zustand'
import type { TorrentInfo, TorrentProgress } from '../../../preload/index.d'

interface TorrentState {
  /** Stream-mode torrents (ephemeral) */
  streams: Map<string, TorrentInfo>
  /** Download-mode torrents (persistent) */
  downloads: Map<string, TorrentInfo>
  /** Progress data for all torrents */
  progress: Map<string, TorrentProgress>

  isLoading: boolean
  error: string | null

  // Streaming (ephemeral)
  addTorrent: (magnetURI: string) => Promise<TorrentInfo>
  cleanupStream: (infoHash: string) => Promise<void>
  loadStreams: () => Promise<void>

  // Downloads (persistent)
  addDownload: (magnetURI: string) => Promise<TorrentInfo>
  loadDownloads: () => Promise<void>

  // Shared
  removeTorrent: (infoHash: string) => Promise<void>
  updateProgress: (data: TorrentProgress) => void
  setTorrentReady: (data: TorrentInfo) => void
  setError: (error: string | null) => void
  clearError: () => void
}

export const useTorrentStore = create<TorrentState>((set, get) => ({
  streams: new Map(),
  downloads: new Map(),
  progress: new Map(),
  isLoading: false,
  error: null,

  // ─── Streaming (ephemeral) ───────────────────────────────────────

  addTorrent: async (magnetURI: string) => {
    set({ isLoading: true, error: null })
    try {
      const info = await window.torrentAPI.addTorrent(magnetURI)
      set((state) => {
        const streams = new Map(state.streams)
        streams.set(info.infoHash, info)
        return { streams, isLoading: false }
      })
      return info
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add torrent'
      set({ isLoading: false, error: message })
      throw err
    }
  },

  cleanupStream: async (infoHash: string) => {
    try {
      await window.torrentAPI.cleanupStream(infoHash)
      set((state) => {
        const streams = new Map(state.streams)
        const progress = new Map(state.progress)
        streams.delete(infoHash)
        progress.delete(infoHash)
        return { streams, progress }
      })
    } catch (err) {
      console.warn('[TorrentStore] Failed to cleanup stream:', err)
    }
  },

  loadStreams: async () => {
    try {
      const list = await window.torrentAPI.getStreams()
      const streams = new Map<string, TorrentInfo>()
      for (const t of list) {
        streams.set(t.infoHash, t)
      }
      set({ streams })
    } catch (err) {
      console.error('[TorrentStore] Failed to load streams:', err)
    }
  },

  // ─── Downloads (persistent) ──────────────────────────────────────

  addDownload: async (magnetURI: string) => {
    set({ isLoading: true, error: null })
    try {
      const info = await window.torrentAPI.addDownload(magnetURI)
      set((state) => {
        const downloads = new Map(state.downloads)
        downloads.set(info.infoHash, info)
        return { downloads, isLoading: false }
      })
      return info
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start download'
      set({ isLoading: false, error: message })
      throw err
    }
  },

  loadDownloads: async () => {
    try {
      const list = await window.torrentAPI.getDownloads()
      const downloads = new Map<string, TorrentInfo>()
      for (const t of list) {
        downloads.set(t.infoHash, t)
      }
      set({ downloads })
    } catch (err) {
      console.error('[TorrentStore] Failed to load downloads:', err)
    }
  },

  // ─── Shared ──────────────────────────────────────────────────────

  removeTorrent: async (infoHash: string) => {
    try {
      await window.torrentAPI.removeTorrent(infoHash)
      set((state) => {
        const streams = new Map(state.streams)
        const downloads = new Map(state.downloads)
        const progress = new Map(state.progress)
        streams.delete(infoHash)
        downloads.delete(infoHash)
        progress.delete(infoHash)
        return { streams, downloads, progress }
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove torrent'
      set({ error: message })
    }
  },

  updateProgress: (data: TorrentProgress) => {
    set((state) => {
      const progress = new Map(state.progress)
      progress.set(data.infoHash, data)
      return { progress }
    })
  },

  setTorrentReady: (data: TorrentInfo) => {
    set((state) => {
      if (data.mode === 'download') {
        const downloads = new Map(state.downloads)
        downloads.set(data.infoHash, data)
        return { downloads }
      } else {
        const streams = new Map(state.streams)
        streams.set(data.infoHash, data)
        return { streams }
      }
    })
  },

  setError: (error) => set({ error }),
  clearError: () => set({ error: null })
}))
