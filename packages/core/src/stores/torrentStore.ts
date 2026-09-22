import { create } from 'zustand'
import type { PreferredEpisodeFile, TorrentInfo, TorrentProgress, TorrentSearchResult } from '../types/torrent'
import { extractInfoHash } from '../utils/utils'
import { usePlaybackSettingsStore } from './playbackSettingsStore'
import { getTorrentAPI } from './torrent-api-adapter'

export interface NextEpisodeMetadata {
  id: number
  seasonId: number
  seasonNumber: number
  episodeNumber: number
  title: string
  stillUrl: string | null
  absoluteEpisodeNumber?: number
}

export interface PlaybackDisplayMetadata {
  title: string
  posterUrl: string | null
  contentKey?: string
  contentType?: 'movie' | 'episode'
  catalogId?: string
  seriesId?: number
  seriesTitle?: string
  seriesImdbId?: string
  seriesAliases?: string[]
  absoluteEpisodeOnly?: boolean
  episodeId?: number
  seasonNumber?: number
  episodeNumber?: number
  episodeTitle?: string
  nextEpisode?: NextEpisodeMetadata
  sourceCandidates?: TorrentSearchResult[]
  sourceIndex?: number
}

export interface TorrentState {
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
  streamPreferredEpisodes: Map<string, PreferredEpisodeFile>
  streamDisplayMetadata: Map<string, PlaybackDisplayMetadata>

  // Streaming (ephemeral)
  addTorrent: (
    magnetURI: string,
    preferredEpisode?: PreferredEpisodeFile,
    displayMetadata?: PlaybackDisplayMetadata
  ) => Promise<TorrentInfo>
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
  streamPreferredEpisodes: new Map(),
  streamDisplayMetadata: new Map(),

  // ─── Streaming (ephemeral) ───────────────────────────────────────

  addTorrent: async (
    magnetURI: string,
    preferredEpisode?: PreferredEpisodeFile,
    displayMetadata?: PlaybackDisplayMetadata
  ) => {
    const incomingHash = extractInfoHash(magnetURI)
    set((state) => {
      const streamMagnets = new Map(state.streamMagnets)
      const torrentErrors = new Map(state.torrentErrors)
      const streamPreferredEpisodes = new Map(state.streamPreferredEpisodes)
      const streamDisplayMetadata = new Map(state.streamDisplayMetadata)
      if (incomingHash) {
        streamMagnets.set(incomingHash, magnetURI)
        if (preferredEpisode) streamPreferredEpisodes.set(incomingHash, preferredEpisode)
        else streamPreferredEpisodes.delete(incomingHash)
        if (displayMetadata) streamDisplayMetadata.set(incomingHash, displayMetadata)
        torrentErrors.delete(incomingHash)
      }
      return { isLoading: true, error: null, streamMagnets, streamPreferredEpisodes, streamDisplayMetadata, torrentErrors }
    })
    try {
      const api = getTorrentAPI()
      const info = await api.addTorrent(magnetURI, preferredEpisode)
      set((state) => {
        const streams = new Map(state.streams)
        const streamMagnets = new Map(state.streamMagnets)
        const torrentErrors = new Map(state.torrentErrors)
        const streamPreferredEpisodes = new Map(state.streamPreferredEpisodes)
        const streamDisplayMetadata = new Map(state.streamDisplayMetadata)
        streams.set(info.infoHash, info)
        streamMagnets.set(info.infoHash.toLowerCase(), magnetURI)
        if (preferredEpisode) streamPreferredEpisodes.set(info.infoHash.toLowerCase(), preferredEpisode)
        else streamPreferredEpisodes.delete(info.infoHash.toLowerCase())
        if (displayMetadata) streamDisplayMetadata.set(info.infoHash.toLowerCase(), displayMetadata)
        torrentErrors.delete(info.infoHash.toLowerCase())
        return { streams, streamMagnets, streamPreferredEpisodes, streamDisplayMetadata, torrentErrors, isLoading: false }
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
      const api = getTorrentAPI()
      await api.cleanupStream(infoHash)
      set((state) => {
        const streams = new Map(state.streams)
        const progress = new Map(state.progress)
        const streamMagnets = new Map(state.streamMagnets)
        const streamPreferredEpisodes = new Map(state.streamPreferredEpisodes)
        const streamDisplayMetadata = new Map(state.streamDisplayMetadata)
        const torrentErrors = new Map(state.torrentErrors)
        streams.delete(infoHash)
        progress.delete(infoHash)
        streamMagnets.delete(infoHash.toLowerCase())
        streamPreferredEpisodes.delete(infoHash.toLowerCase())
        streamDisplayMetadata.delete(infoHash.toLowerCase())
        torrentErrors.delete(infoHash.toLowerCase())
        return { streams, progress, streamMagnets, streamPreferredEpisodes, streamDisplayMetadata, torrentErrors, error: null }
      })
    } catch (err) {
      console.warn('[TorrentStore] Failed to cleanup stream:', err)
    }
  },

  loadStreams: async () => {
    try {
      const api = getTorrentAPI()
      const list = await api.getStreams()
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
    const key = infoHash.toLowerCase()
    const magnetURI = get().streamMagnets.get(key)
    const preferredEpisode = get().streamPreferredEpisodes.get(key)
    const displayMetadata = get().streamDisplayMetadata.get(key)
    if (!magnetURI) throw new Error('The original magnet link is no longer available. Choose the source again.')
    const candidates = displayMetadata?.sourceCandidates ?? []
    const currentIndex = displayMetadata?.sourceIndex ?? candidates.findIndex((source) => source.magnetURI === magnetURI)
    const useFallback = usePlaybackSettingsStore.getState().automaticSourceFallback
      && currentIndex >= 0
      && currentIndex + 1 < candidates.length
    const nextSource = useFallback ? candidates[currentIndex + 1] : null
    const nextMetadata = displayMetadata && nextSource
      ? { ...displayMetadata, sourceIndex: currentIndex + 1 }
      : displayMetadata
    const nextPreferredEpisode = preferredEpisode && nextSource
      ? (() => {
        const { fileIndex: _ignoredFileIndex, ...episodeIdentity } = preferredEpisode
        return {
          ...episodeIdentity,
          ...(nextSource.fileIndex !== undefined ? { fileIndex: nextSource.fileIndex } : {})
        }
      })()
      : preferredEpisode
    await get().cleanupStream(infoHash)
    return get().addTorrent(nextSource?.magnetURI ?? magnetURI, nextPreferredEpisode, nextMetadata)
  },

  // ─── Downloads (persistent) ──────────────────────────────────────

  addDownload: async (magnetURI: string) => {
    set({ isLoading: true, error: null })
    try {
      const api = getTorrentAPI()
      const info = await api.addDownload(magnetURI)
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
      const api = getTorrentAPI()
      const list = await api.getDownloads()
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
      const api = getTorrentAPI()
      await api.removeTorrent(infoHash)
      set((state) => {
        const streams = new Map(state.streams)
        const downloads = new Map(state.downloads)
        const progress = new Map(state.progress)
        const streamMagnets = new Map(state.streamMagnets)
        const torrentErrors = new Map(state.torrentErrors)
        const streamPreferredEpisodes = new Map(state.streamPreferredEpisodes)
        const streamDisplayMetadata = new Map(state.streamDisplayMetadata)
        streams.delete(infoHash)
        downloads.delete(infoHash)
        progress.delete(infoHash)
        streamMagnets.delete(infoHash.toLowerCase())
        streamPreferredEpisodes.delete(infoHash.toLowerCase())
        streamDisplayMetadata.delete(infoHash.toLowerCase())
        torrentErrors.delete(infoHash.toLowerCase())
        return { streams, downloads, progress, streamMagnets, streamPreferredEpisodes, streamDisplayMetadata, torrentErrors, error: null }
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
