/**
 * User data store — manages watchlist, watch history, and continue watching.
 * Persists to localStorage so data survives app restarts.
 */

import { create } from 'zustand'
import { preserveHistoryMetadata } from '../lib/history-policy'

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

interface WatchlistEntry {
  movieId: string
  slug: string
  title: string
  poster: string
  addedAt: number
  year: number
  rating: number
  magnetURI: string
}

interface UserDataState {
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
}

const STORAGE_KEY_WATCHLIST = 'streamforge_watchlist'
const STORAGE_KEY_HISTORY = 'streamforge_history'

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
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
      localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(updated))
      return { watchlist: updated }
    })
  },

  removeFromWatchlist: (movieId) => {
    set((state) => {
      const updated = state.watchlist.filter((e) => e.movieId !== movieId)
      localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(updated))
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
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated))
      return { history: updated }
    })
  },

  removeFromHistory: (identity) => {
    set((state) => {
      const updated = state.history.filter((item) => (
        item.movieId !== identity && item.contentKey !== identity
      ))
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated))
      return { history: updated }
    })
  },

  clearHistory: () => {
    localStorage.removeItem(STORAGE_KEY_HISTORY)
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
    localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(watchlist))
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history))
  }
}))
