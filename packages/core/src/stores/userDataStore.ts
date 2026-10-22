/**
 * User data store — manages watchlist, watch history, and continue watching.
 * Persists to storage adapter so data survives app restarts.
 */

import { create } from 'zustand'
import { preserveHistoryMetadata } from '../policies/history-policy'
import { api } from '../clients/api'
import { useAuthStore, getAuthGeneration } from './authStore'
import { extractInfoHash } from '../utils/utils'
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
  fileIndex?: number
  streamURL?: string
}

export interface WatchlistEntry {
  movieId: string
  contentType?: 'movie' | 'series'
  catalogId?: string | number
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
const DELETIONS_KEY = 'streamforge_library_deletions'
let deletions: { watchlist: string[]; history: string[] } = { watchlist: [], history: [] }
function loadDeletions() {
  const value = loadJSON<any>(DELETIONS_KEY, {})
  deletions = {
    watchlist: Array.isArray(value?.watchlist) ? value.watchlist.filter((key: unknown) => typeof key === 'string').slice(-1000) : [],
    history: Array.isArray(value?.history) ? value.history.filter((key: unknown) => typeof key === 'string').slice(-1000) : []
  }
}
function rememberDeletion(kind: 'watchlist' | 'history', keys: string[], deleted: boolean) {
  const combined = new Set(deletions[kind])
  for (const key of keys) { if (deleted) combined.add(key); else combined.delete(key) }
  deletions[kind] = [...combined].slice(-1000)
  getStorageAdapter().setItem(DELETIONS_KEY, JSON.stringify(deletions))
}
let syncTimer: ReturnType<typeof setTimeout> | null = null
let scheduledAt = 0
let scheduledGeneration = -1
function scheduleSync(delay = 2000) {
  if (!useAuthStore.getState().isAuthenticated) return
  const expected = getAuthGeneration()
  if (syncTimer && scheduledGeneration === expected && scheduledAt <= Date.now() + delay) return
  if (syncTimer) clearTimeout(syncTimer)
  scheduledGeneration = expected
  scheduledAt = Date.now() + delay
  syncTimer = setTimeout(() => {
    syncTimer = null
    if (expected === getAuthGeneration()) void useUserDataStore.getState().syncToCloud()
  }, delay)
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const storage = getStorageAdapter()
    const raw = storage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : fallback
    if (Array.isArray(fallback)) {
      if (!Array.isArray(parsed)) return fallback
      return parsed.filter(item => item && typeof item.movieId === 'string' && typeof item.title === 'string') as T
    }
    return parsed
  } catch {
    return fallback
  }
}

export const useUserDataStore = create<UserDataState>((set, get) => ({
  watchlist: loadJSON<WatchlistEntry[]>(STORAGE_KEY_WATCHLIST, []),
  history: loadJSON<WatchHistoryEntry[]>(STORAGE_KEY_HISTORY, []),

  addToWatchlist: (entry) => {
    rememberDeletion('watchlist', [entry.movieId], false)
    scheduleSync()
    set((state) => {
      if (state.watchlist.some((e) => e.movieId === entry.movieId)) return state
      const updated = [{ ...entry, addedAt: Date.now() }, ...state.watchlist]
      getStorageAdapter().setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(updated))
      return { watchlist: updated }
    })
  },

  removeFromWatchlist: (movieId) => {
    rememberDeletion('watchlist', [movieId], true)
    scheduleSync()
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
    rememberDeletion('history', [entry.contentKey || entry.movieId], false)
    scheduleSync(30000)
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
    rememberDeletion('history', get().history.filter(item => item.movieId === identity || item.contentKey === identity).map(item => item.contentKey || item.movieId), true)
    scheduleSync()
    set((state) => {
      const updated = state.history.filter((item) => (
        item.movieId !== identity && item.contentKey !== identity
      ))
      getStorageAdapter().setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated))
      return { history: updated }
    })
  },

  clearHistory: () => {
    rememberDeletion('history', get().history.map(item => item.contentKey || item.movieId), true)
    scheduleSync()
    getStorageAdapter().removeItem(STORAGE_KEY_HISTORY)
    set({ history: [] })
  },

  _loadFromStorage: () => {
    loadDeletions()
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
      // Both requests capture this account's token before yielding to another login/logout.
      await Promise.all([api.syncWatchlist(watchlist.map((w) => ({
        content_key: w.movieId,
        title: w.title,
        poster_url: w.poster,
        metadata: { slug: w.slug, year: w.year, rating: w.rating, magnetURI: w.magnetURI, contentType: w.contentType, catalogId: w.catalogId }
      }))), api.syncHistory(history.map((h) => ({
        content_key: h.contentKey || h.movieId,
        title: h.title,
        poster_url: h.poster,
        progress: h.progress,
        current_time: h.currentTime,
        duration: h.duration,
        metadata: { slug: h.slug, magnetURI: h.magnetURI, infoHash: h.movieId, fileIndex: h.fileIndex, streamURL: h.streamURL, contentType: h.contentType, seriesTitle: h.seriesTitle, episodeTitle: h.episodeTitle, seasonNumber: h.seasonNumber, episodeNumber: h.episodeNumber }
      })))])
    } catch {
      // Silently ignore sync errors
    }
  },

  syncFromCloud: async () => {
    const expected = getAuthGeneration()
    const { isAuthenticated } = useAuthStore.getState()
    if (!isAuthenticated) return
    try {
      const [watchlistRes, historyRes] = await Promise.all([
        api.getCloudWatchlist(),
        api.getCloudHistory()
      ])
      if (expected !== getAuthGeneration()) return
      const cloudWatchlist = (watchlistRes?.data ?? []).filter((item: any) => !deletions.watchlist.includes(item.content_key))
      const cloudHistory = (historyRes?.data ?? []).filter((item: any) => !deletions.history.includes(item.content_key))
      
      if (cloudWatchlist.length > 0 || cloudHistory.length > 0) {
        set((state) => {
          // Merge watchlist: cloud items win, keep local-only items
          const cloudWatchlistKeys = new Set(cloudWatchlist.map((w: any) => w.content_key))
          const localOnly = state.watchlist.filter((w) => !cloudWatchlistKeys.has(w.movieId))
          const mergedWatchlist = [
            ...cloudWatchlist.map((w: any) => ({
              movieId: w.content_key,
              contentType: w.metadata?.contentType,
              catalogId: w.metadata?.catalogId,
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
              movieId: h.metadata?.infoHash || extractInfoHash(h.metadata?.magnetURI || '') || h.content_key,
              contentKey: h.content_key,
              slug: h.metadata?.slug ?? h.content_key,
              title: h.title ?? '',
              poster: h.poster_url ?? '',
              watchedAt: new Date(h.watched_at).getTime(),
              progress: h.progress ?? 0,
              currentTime: h.current_time,
              duration: h.duration,
              magnetURI: h.metadata?.magnetURI ?? '',
              fileIndex: h.metadata?.fileIndex,
              streamURL: h.metadata?.streamURL,
              contentType: h.metadata?.contentType,
              seriesTitle: h.metadata?.seriesTitle,
              episodeTitle: h.metadata?.episodeTitle,
              seasonNumber: h.metadata?.seasonNumber,
              episodeNumber: h.metadata?.episodeNumber
            })),
            ...localOnlyHistory
          ].slice(0, 50)
          
          const resolvedHistory = mergedHistory.map(item => {
            const local = state.history.find(existing => (existing.contentKey || existing.movieId) === (item.contentKey || item.movieId))
            return local && local.watchedAt > item.watchedAt ? local : item
          }).sort((a, b) => b.watchedAt - a.watchedAt).slice(0, 50)
          getStorageAdapter().setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(mergedWatchlist))
          getStorageAdapter().setItem(STORAGE_KEY_HISTORY, JSON.stringify(resolvedHistory))
          return { watchlist: mergedWatchlist, history: resolvedHistory }
        })
      }
    } catch {
      // Silently ignore sync errors
    }
  }
}))
