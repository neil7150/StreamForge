/**
 * User data store — manages watchlist, watch history, and continue watching.
 * Persists to storage adapter so data survives app restarts.
 */

import { create } from 'zustand'
import { preserveHistoryMetadata } from '../policies/history-policy'
import { api } from '../clients/api'
import { useAuthStore } from './authStore'
import { getStorageAdapter } from './storage-adapter'

export interface WatchHistoryEntry {
  movieId: string
  /** Stable catalog identity. Older entries fall back to movieId (torrent hash). */
  contentKey?: string
  contentType?: 'movie' | 'episode'
  catalogId?: string
  seriesId?: number
  seriesTitle?: string
  episodeId?: number
  seasonNumber?: number
  episodeNumber?: number
  episodeTitle?: string
  slug: string
  title: string
  poster: string
  watchedAt: number // timestamp
  progress: number  // 0-1, how far they watched
  currentTime?: number
  duration?: number
  magnetURI: string
}

export interface WatchlistEntry {
  movieId: string
  slug: string
  title: string
  poster: string
  addedAt: number
  year: number
  rating: number
  magnetURI: string
}

export type WatchlistItem = WatchlistEntry
export type WatchHistoryItem = WatchHistoryEntry

export interface UserDataState {
  watchlist: WatchlistEntry[]
  history: WatchHistoryEntry[]

  // Watchlist
  addToWatchlist: (entry: Omit<WatchlistEntry, 'addedAt'>) => void
  removeFromWatchlist: (movieId: string) => void
  isInWatchlist: (movieId: string) => boolean

  // History
  addToHistory: (entry: Omit<WatchHistoryEntry, 'watchedAt'>) => void
  removeFromHistory: (identity: string) => void
  clearHistory: () => void

  // Persistence
  _loadFromStorage: () => void
  _saveToStorage: () => void
  syncToCloud: () => Promise<void>
  syncFromCloud: () => Promise<void>
}

const STORAGE_KEY_WATCHLIST = 'streamforge_watchlist'
const STORAGE_KEY_HISTORY = 'streamforge_history'

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const storage = getStorageAdapter()
    const raw = storage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export const useUserDataStore = create<UserDataState>((set, get) => ({
  watchlist: loadJSON<WatchlistEntry[]>(STORAGE_KEY_WATCHLIST, []),
  history: loadJSON<WatchHistoryEntry[]>(STORAGE_KEY_HISTORY, []),

  addToWatchlist: (entry) => {
    set((state) => {
      if (state.watchlist.some((e) => e.movieId === entry.movieId)) return state
      const updated = [{ ...entry, addedAt: Date.now() }, ...state.watchlist]
      getStorageAdapter().setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(updated))
      return { watchlist: updated }
    })
  },

  removeFromWatchlist: (movieId) => {
    set((state) => {
      const updated = state.watchlist.filter((e) => e.movieId !== movieId)
      getStorageAdapter().setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(updated))
      return { watchlist: updated }
    })
  },

  isInWatchlist: (movieId) => {
    return get().watchlist.some((e) => e.movieId === movieId)
  },

  addToHistory: (entry) => {
    set((state) => {
      const identity = entry.contentKey || entry.movieId
      // Catalog identity keeps progress stable when a different torrent source is selected.
      const existing = state.history.find((item) => (item.contentKey || item.movieId) === identity)
      const preserved = preserveHistoryMetadata(existing, entry)
      const filtered = state.history.filter((item) => (item.contentKey || item.movieId) !== identity)
      const updated = [{ ...preserved, watchedAt: Date.now() }, ...filtered].slice(0, 50) // keep last 50
      getStorageAdapter().setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated))
      return { history: updated }
    })
  },

  removeFromHistory: (identity) => {
    set((state) => {
      const updated = state.history.filter((item) => (
        item.movieId !== identity && item.contentKey !== identity
      ))
      getStorageAdapter().setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated))
      return { history: updated }
    })
  },

  clearHistory: () => {
    getStorageAdapter().removeItem(STORAGE_KEY_HISTORY)
    set({ history: [] })
  },

  _loadFromStorage: () => {
    set({
      watchlist: loadJSON<WatchlistEntry[]>(STORAGE_KEY_WATCHLIST, []),
      history: loadJSON<WatchHistoryEntry[]>(STORAGE_KEY_HISTORY, [])
    })
  },

  _saveToStorage: () => {
    const { watchlist, history } = get()
    getStorageAdapter().setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(watchlist))
    getStorageAdapter().setItem(STORAGE_KEY_HISTORY, JSON.stringify(history))
  },

  syncToCloud: async () => {
    const { isAuthenticated } = useAuthStore.getState()
    if (!isAuthenticated) return
    try {
      const { watchlist, history } = get()
      await api.syncWatchlist(watchlist.map((w) => ({
        content_key: w.movieId,
        title: w.title,
        poster_url: w.poster,
        metadata: { slug: w.slug, year: w.year, rating: w.rating, magnetURI: w.magnetURI }
      })))
      await api.syncHistory(history.map((h) => ({
        content_key: h.contentKey || h.movieId,
        title: h.title,
        poster_url: h.poster,
        progress: h.progress,
        current_time: h.currentTime,
        duration: h.duration,
        metadata: { slug: h.slug, magnetURI: h.magnetURI, contentType: h.contentType, seriesTitle: h.seriesTitle, episodeTitle: h.episodeTitle, seasonNumber: h.seasonNumber, episodeNumber: h.episodeNumber }
      })))
    } catch {
      // Silently ignore sync errors
    }
  },

  syncFromCloud: async () => {
    const { isAuthenticated } = useAuthStore.getState()
    if (!isAuthenticated) return
    try {
      const [watchlistRes, historyRes] = await Promise.all([
        api.getCloudWatchlist(),
        api.getCloudHistory()
      ])
      const cloudWatchlist = watchlistRes?.data ?? []
      const cloudHistory = historyRes?.data ?? []
      
      if (cloudWatchlist.length > 0 || cloudHistory.length > 0) {
        set((state) => {
          // Merge watchlist: cloud items win, keep local-only items
          const cloudWatchlistKeys = new Set(cloudWatchlist.map((w: any) => w.content_key))
          const localOnly = state.watchlist.filter((w) => !cloudWatchlistKeys.has(w.movieId))
          const mergedWatchlist = [
            ...cloudWatchlist.map((w: any) => ({
              movieId: w.content_key,
              slug: w.metadata?.slug ?? w.content_key,
              title: w.title ?? '',
              poster: w.poster_url ?? '',
              addedAt: new Date(w.added_at).getTime(),
              year: w.metadata?.year ?? 0,
              rating: w.metadata?.rating ?? 0,
              magnetURI: w.metadata?.magnetURI ?? ''
            })),
            ...localOnly
          ]
          
          // Merge history: cloud items win, keep local-only items
          const cloudHistoryKeys = new Set(cloudHistory.map((h: any) => h.content_key))
          const localOnlyHistory = state.history.filter((h) => !cloudHistoryKeys.has(h.contentKey || h.movieId))
          const mergedHistory = [
            ...cloudHistory.map((h: any) => ({
              movieId: h.content_key,
              contentKey: h.content_key,
              slug: h.metadata?.slug ?? h.content_key,
              title: h.title ?? '',
              poster: h.poster_url ?? '',
              watchedAt: new Date(h.watched_at).getTime(),
              progress: h.progress ?? 0,
              currentTime: h.current_time,
              duration: h.duration,
              magnetURI: h.metadata?.magnetURI ?? '',
              contentType: h.metadata?.contentType,
              seriesTitle: h.metadata?.seriesTitle,
              episodeTitle: h.metadata?.episodeTitle,
              seasonNumber: h.metadata?.seasonNumber,
              episodeNumber: h.metadata?.episodeNumber
            })),
            ...localOnlyHistory
          ].slice(0, 50)
          
          getStorageAdapter().setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(mergedWatchlist))
          getStorageAdapter().setItem(STORAGE_KEY_HISTORY, JSON.stringify(mergedHistory))
          return { watchlist: mergedWatchlist, history: mergedHistory }
        })
      }
    } catch {
      // Silently ignore sync errors
    }
  }
}))
