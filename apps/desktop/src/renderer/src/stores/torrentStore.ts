import { create } from 'zustand'
import type { TorrentInfo, TorrentProgress } from '../../../preload/index.d'
import { extractInfoHash } from '../lib/utils'

interface TorrentState {
  /** Stream-mode torrents (ephemeral) */
  streams: Map<string, TorrentInfo>
  /** Download-mode torrents (persistent) */
  downloads: Map<string, TorrentInfo>
  /** Progress data for all torrents */
  progress: Map<string, TorrentProgress>
  /** Asynchronous torrent errors keyed by info hash. */
  torrentErrors: Map<string, string>

  isLoading: boolean
  error: string | null
  streamMagnets: Map<string, string>

  // Streaming (ephemeral)
  addTorrent: (magnetURI: string) => Promise<TorrentInfo>
  cleanupStream: (infoHash: string) => Promise<void>
  loadStreams: () => Promise<void>
  retryStream: (infoHash: string) => Promise<TorrentInfo>


  // Downloads (persistent)
  addDownload: (magnetURI: string) => Promise<TorrentInfo>
  loadDownloads: () => Promise<void>

  // Shared
  removeTorrent: (infoHash: string) => Promise<void>
  updateProgress: (data: TorrentProgress) => void
  setTorrentReady: (data: TorrentInfo) => void
  setTorrentError: (infoHash: string, error: string) => void
  setError: (error: string | null) => void
  clearError: () => void
}

export const useTorrentStore = create<TorrentState>((set, get) => ({
  streams: new Map(),
  downloads: new Map(),
  progress: new Map(),
  torrentErrors: new Map(),
  isLoading: false,
  error: null,
  streamMagnets: new Map(),

  // ─── Streaming (ephemeral) ───────────────────────────────────────

  addTorrent: async (magnetURI: string) => {
    const incomingHash = extractInfoHash(magnetURI)
    set((state) => {
      const streamMagnets = new Map(state.streamMagnets)
      const torrentErrors = new Map(state.torrentErrors)
      if (incomingHash) {
        streamMagnets.set(incomingHash, magnetURI)
        torrentErrors.delete(incomingHash)
      }
      return { isLoading: true, error: null, streamMagnets, torrentErrors }
    })
    try {
      const info = await window.torrentAPI.addTorrent(magnetURI)
      set((state) => {
        const streams = new Map(state.streams)
        const streamMagnets = new Map(state.streamMagnets)
        const torrentErrors = new Map(state.torrentErrors)
        streams.set(info.infoHash, info)
        streamMagnets.set(info.infoHash.toLowerCase(), magnetURI)
        torrentErrors.delete(info.infoHash.toLowerCase())
        return { streams, streamMagnets, torrentErrors, isLoading: false }
      })
      return info
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add torrent'
      set((state) => {
        const torrentErrors = new Map(state.torrentErrors)
        if (incomingHash) {
          if (message.includes('STREAM_CANCELLED')) {
            torrentErrors.delete(incomingHash)
          } else {
            torrentErrors.set(incomingHash, message)
          }
        }
        return {
          isLoading: false,
          error: message.includes('STREAM_CANCELLED') ? null : message,
          torrentErrors
        }
      })
      throw err
    }
  },

  cleanupStream: async (infoHash: string) => {
    try {
      await window.torrentAPI.cleanupStream(infoHash)
      set((state) => {
        const streams = new Map(state.streams)
        const progress = new Map(state.progress)
        const streamMagnets = new Map(state.streamMagnets)
        const torrentErrors = new Map(state.torrentErrors)
        streams.delete(infoHash)
        progress.delete(infoHash)
        streamMagnets.delete(infoHash.toLowerCase())
        torrentErrors.delete(infoHash.toLowerCase())
        return { streams, progress, streamMagnets, torrentErrors, error: null }
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

  retryStream: async (infoHash: string) => {
    const magnetURI = get().streamMagnets.get(infoHash.toLowerCase())
    if (!magnetURI) throw new Error('The original magnet link is no longer available. Choose the source again.')
    await get().cleanupStream(infoHash)
    return get().addTorrent(magnetURI)
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
        const streamMagnets = new Map(state.streamMagnets)
        const torrentErrors = new Map(state.torrentErrors)
        streams.delete(infoHash)
        downloads.delete(infoHash)
        progress.delete(infoHash)
        streamMagnets.delete(infoHash.toLowerCase())
        torrentErrors.delete(infoHash.toLowerCase())
        return { streams, downloads, progress, streamMagnets, torrentErrors, error: null }
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
      const torrentErrors = new Map(state.torrentErrors)
      torrentErrors.delete(data.infoHash.toLowerCase())
      if (data.mode === 'download') {
        const downloads = new Map(state.downloads)
        downloads.set(data.infoHash, data)
        return { downloads, torrentErrors }
      } else {
        const streams = new Map(state.streams)
        streams.set(data.infoHash, data)
        return { streams, torrentErrors }
      }
    })
  },

  setTorrentError: (infoHash, error) => {
    set((state) => {
      const torrentErrors = new Map(state.torrentErrors)
      torrentErrors.set(infoHash.toLowerCase(), error)
      return { torrentErrors }
    })
  },
  setError: (error) => set({ error }),
  clearError: () => set({ error: null })
}))
