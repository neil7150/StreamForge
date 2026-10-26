/**
 * User data store — manages watchlist, watch history, and continue watching.
 * Persists to storage adapter so data survives app restarts.
 */

import { create } from 'zustand'
import { baselineOf, hasLibraryChanges, mergeLibrary, type LibraryBaseline } from '../policies/library-merge'
import { preserveHistoryMetadata } from '../policies/history-policy'
import { api } from '../clients/api'
import { useAuthStore, getAuthGeneration } from './authStore'
import { extractInfoHash } from '../utils/utils'
import { getStorageAdapter } from './storage-adapter'
import { librarySnapshot, syncRevision } from '../clients/library-contract'
import { accountsEnabled } from './account-features'
import type { CloudWatchlistItem, CloudHistoryItem } from '../clients/library-contract'

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
  syncError: string | null
  isSyncing: boolean

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
interface SyncContext { generation: number; watchlist: number | null; history: number | null; needsRead: boolean; tail: Promise<void> }
let syncContext: SyncContext | null = null
function accountSync(): SyncContext {
  const generation = getAuthGeneration()
  if (!syncContext || syncContext.generation !== generation) syncContext = { generation, watchlist: null, history: null, needsRead: true, tail: Promise.resolve() }
  return syncContext
}
function isActive(context: SyncContext) { return accountsEnabled() && context.generation === getAuthGeneration() && useAuthStore.getState().isAuthenticated }
function queueSync(work: (context: SyncContext) => Promise<void>): Promise<void> {
  if (!accountsEnabled() || !useAuthStore.getState().isAuthenticated) return Promise.resolve()
  const context = accountSync()
  const run = context.tail.then(async () => {
    if (!isActive(context)) return
    useUserDataStore.setState({ isSyncing: true })
    try {
      if (persistenceError) throw new Error('Saved library needs recovery')
      await work(context)
      if (isActive(context)) useUserDataStore.setState({ syncError: null })
    } catch (error) {
      if (isActive(context)) {
        context.needsRead = true
        const conflict = (error as { status?: number }).status === 409
        useUserDataStore.setState({ syncError: persistenceError ? 'Saved library could not be read. Restart the app to retry; cloud sync is paused.' : conflict ? 'Your cloud library changed. Tap Retry to reload and sync.' : 'Cloud sync failed. Your library is saved on this device. Tap Retry.' })
      }
    } finally { if (isActive(context)) useUserDataStore.setState({ isSyncing: false }) }
  })
  context.tail = run
  return run
}
const LIBRARY_RECORD_KEY = 'streamforge_library_v2'
const watchlistIdentity = { key: (item: WatchlistEntry) => item.movieId, time: (item: WatchlistEntry) => item.addedAt }
const historyIdentity = { key: (item: WatchHistoryEntry) => item.contentKey || item.movieId, time: (item: WatchHistoryEntry) => item.watchedAt }
let baseline: { watchlist: LibraryBaseline; history: LibraryBaseline } = { watchlist: [], history: [] }
let persistenceError = false

// Items and their sync baseline share one durable write. A crash cannot pair a
// new baseline with an older item list and turn that mismatch into cloud edits.
function persistLibrary(watchlist: WatchlistEntry[], history: WatchHistoryEntry[], nextBaseline = baseline) {
  getStorageAdapter().setItem(LIBRARY_RECORD_KEY, JSON.stringify({ version: 2, watchlist, history, baseline: nextBaseline }))
  baseline = nextBaseline
}
function removalBaseline(kind: 'watchlist' | 'history', keys: string[]) {
  if (!accountsEnabled()) return { watchlist: [], history: [] }
  const known = new Map(baseline[kind])
  // A newly added item can also exist on an offline device we have not read yet.
  for (const key of keys) if (!known.has(key)) known.set(key, -1)
  if (known.size > 6000) {
    useUserDataStore.setState({ syncError: 'Too many offline changes. Sync your library before removing more items.' })
    return null
  }
  return { ...baseline, [kind]: [...known.entries()] }
}
function validBaseline(value: unknown): value is LibraryBaseline {
  return Array.isArray(value) && value.length <= 6000 && value.every(entry =>
    Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && Number.isFinite(entry[1]))
    && new Set(value.map(entry => entry[0])).size === value.length
}
function readLibrary(): { watchlist: WatchlistEntry[]; history: WatchHistoryEntry[] } {
  const raw = getStorageAdapter().getItem(LIBRARY_RECORD_KEY)
  if (raw !== null) {
    const record = JSON.parse(raw)
    const validItems = (items: unknown, field: string, limit: number) => Array.isArray(items) && items.length <= limit
      && items.every(item => item && typeof item.movieId === 'string' && typeof item.title === 'string' && Number.isFinite(item[field]))
    if (record?.version !== 2 || !validItems(record.watchlist, 'addedAt', 5000) || !validItems(record.history, 'watchedAt', 50)
      || !validBaseline(record.baseline?.watchlist) || !validBaseline(record.baseline?.history)) throw new Error('Invalid saved library')
    baseline = record.baseline
    return { watchlist: record.watchlist, history: record.history }
  }
  // One-time import: older clients did not record what was acknowledged by the
  // server. Preserve their local items as pending additions and old removals.
  const old = loadJSON<any>(DELETIONS_KEY, {})
  const removed = (value: unknown): LibraryBaseline => Array.isArray(value)
    ? [...new Set(value.filter((key): key is string => typeof key === 'string'))].map(key => [key, -1]) : []
  baseline = { watchlist: removed(old?.watchlist), history: removed(old?.history) }
  const watchlist = loadJSON<WatchlistEntry[]>(STORAGE_KEY_WATCHLIST, []).filter(item => !baseline.watchlist.some(([key]) => key === item.movieId))
  const history = loadJSON<WatchHistoryEntry[]>(STORAGE_KEY_HISTORY, []).filter(item => !baseline.history.some(([key]) => key === historyIdentity.key(item))).slice(0, 50)
  persistLibrary(watchlist, history)
  return { watchlist, history }
}
function nextEditTime(previous?: number): number { return Math.max(Date.now(), (previous ?? 0) + 1) }
let syncTimer: ReturnType<typeof setTimeout> | null = null
let scheduledAt = 0
let scheduledGeneration = -1
function scheduleSync(delay = 2000) {
  if (!accountsEnabled() || !useAuthStore.getState().isAuthenticated) return
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
  syncError: null,
  isSyncing: false,

  addToWatchlist: (entry) => {
    if (persistenceError) return
    scheduleSync()
    set((state) => {
      if (state.watchlist.some((e) => e.movieId === entry.movieId)) return state
      if (state.watchlist.length >= 5000) return { syncError: 'Your watchlist is full. Remove an item before adding another.' }
      const updated = [{ ...entry, addedAt: nextEditTime(new Map(baseline.watchlist).get(entry.movieId)) }, ...state.watchlist]
      persistLibrary(updated, state.history)
      return { watchlist: updated }
    })
  },

  removeFromWatchlist: (movieId) => {
    if (persistenceError) return
    const next = removalBaseline('watchlist', get().watchlist.filter(item => item.movieId === movieId).map(item => item.movieId))
    if (!next) return
    scheduleSync()
    set((state) => {
      const updated = state.watchlist.filter((e) => e.movieId !== movieId)
      persistLibrary(updated, state.history, next)
      return { watchlist: updated }
    })
  },

  isInWatchlist: (movieId) => {
    return get().watchlist.some((e) => e.movieId === movieId)
  },

  addToHistory: (entry) => {
    if (persistenceError) return
    scheduleSync(30000)
    set((state) => {
      const identity = entry.contentKey || entry.movieId
      // Catalog identity keeps progress stable when a different torrent source is selected.
      const existing = state.history.find((item) => (item.contentKey || item.movieId) === identity)
      const preserved = preserveHistoryMetadata(existing, entry)
      const filtered = state.history.filter((item) => (item.contentKey || item.movieId) !== identity)
      const updated = [{ ...preserved, watchedAt: nextEditTime(Math.max(existing?.watchedAt ?? 0, new Map(baseline.history).get(identity) ?? 0)) }, ...filtered].slice(0, 50) // keep last 50
      persistLibrary(state.watchlist, updated)
      return { history: updated }
    })
  },

  removeFromHistory: (identity) => {
    if (persistenceError) return
    const next = removalBaseline('history', get().history.filter(item => item.movieId === identity || item.contentKey === identity).map(historyIdentity.key))
    if (!next) return
    scheduleSync()
    set((state) => {
      const updated = state.history.filter((item) => (
        item.movieId !== identity && item.contentKey !== identity
      ))
      persistLibrary(state.watchlist, updated, next)
      return { history: updated }
    })
  },

  clearHistory: () => {
    if (persistenceError) return
    scheduleSync()
    const next = removalBaseline('history', get().history.map(historyIdentity.key))
    if (!next) return
    persistLibrary(get().watchlist, [], next)
    set({ history: [] })
  },

  _loadFromStorage: () => {
    if (syncTimer && (!accountsEnabled() || scheduledGeneration !== getAuthGeneration())) { clearTimeout(syncTimer); syncTimer = null }
    if (syncContext) syncContext.needsRead = true
    try {
      const library = readLibrary()
      persistenceError = false
      set({ ...library, syncError: null, isSyncing: false })
    } catch {
      persistenceError = true
      set({ watchlist: [], history: [], isSyncing: false, syncError: 'Saved library could not be read. Restart the app to retry.' })
    }
  },

  _saveToStorage: () => {
    if (!persistenceError) persistLibrary(get().watchlist, get().history)
  },

  syncToCloud: () => queueSync(async context => {
      // Never replace the server from an unread/failed/previous-account snapshot.
      if (context.needsRead) await pullCloud(context)
      if (!isActive(context) || context.watchlist === null || context.history === null) return
      const { watchlist, history } = get()
      if (hasLibraryChanges(watchlist, baseline.watchlist, watchlistIdentity)) {
      const watchlistRevision = context.watchlist
      const watchlistRes = await api.syncWatchlist(watchlist.map((w) => ({
        content_key: w.movieId,
        title: w.title,
        poster_url: w.poster,
        added_at: new Date(w.addedAt).toISOString(),
        metadata: { slug: w.slug, year: w.year, rating: w.rating, magnetURI: w.magnetURI, contentType: w.contentType, catalogId: w.catalogId }
      })), watchlistRevision)
      if (!isActive(context)) return
      context.watchlist = syncRevision(watchlistRes.data, watchlistRevision)
      persistLibrary(get().watchlist, get().history, { ...baseline, watchlist: baselineOf(watchlist, watchlistIdentity) })
      }
      if (hasLibraryChanges(history, baseline.history, historyIdentity)) {
      const historyRevision = context.history
      const historyRes = await api.syncHistory(history.map((h) => ({
        content_key: h.contentKey || h.movieId,
        title: h.title,
        poster_url: h.poster,
        watched_at: new Date(h.watchedAt).toISOString(),
        progress: h.progress,
        current_time: h.currentTime,
        duration: h.duration,
        metadata: { slug: h.slug, magnetURI: h.magnetURI, infoHash: h.movieId, fileIndex: h.fileIndex, streamURL: h.streamURL, contentType: h.contentType, seriesTitle: h.seriesTitle, episodeTitle: h.episodeTitle, seasonNumber: h.seasonNumber, episodeNumber: h.episodeNumber }
      })), historyRevision)
      if (!isActive(context)) return
      context.history = syncRevision(historyRes.data, historyRevision)
      persistLibrary(get().watchlist, get().history, { ...baseline, history: baselineOf(history, historyIdentity) })
      }
  }),

  syncFromCloud: () => queueSync(async context => {
    if (await pullCloud(context)) scheduleSync()
  })
}))

async function pullCloud(context: SyncContext): Promise<boolean> {
      const [watchlistRes, historyRes] = await Promise.all([
        api.getCloudWatchlist(),
        api.getCloudHistory()
      ])
      if (!isActive(context)) return false
      const watchlistSnapshot = librarySnapshot<CloudWatchlistItem>(watchlistRes?.data, 'watchlist')
      const historySnapshot = librarySnapshot<CloudHistoryItem>(historyRes?.data, 'history')
      const cloudWatchlist = watchlistSnapshot.items
      const cloudHistory = historySnapshot.items
      const remoteWatchlist = cloudWatchlist.map((w): WatchlistEntry => ({
              movieId: w.content_key,
              contentType: w.metadata.contentType === 'series' ? 'series' : 'movie',
              catalogId: w.metadata?.catalogId,
              slug: w.metadata?.slug ?? w.content_key,
              title: w.title ?? '',
              poster: w.poster_url ?? '',
              addedAt: new Date(w.added_at).getTime(),
              year: w.metadata?.year ?? 0,
              rating: w.metadata?.rating ?? 0,
              magnetURI: w.metadata?.magnetURI ?? ''
            }))
      const remoteHistory = cloudHistory.map((h): WatchHistoryEntry => ({
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
              contentType: h.metadata.contentType === 'episode' ? 'episode' : 'movie',
              seriesTitle: h.metadata?.seriesTitle,
              episodeTitle: h.metadata?.episodeTitle,
              seasonNumber: h.metadata?.seasonNumber,
              episodeNumber: h.metadata?.episodeNumber
            }))
      const local = useUserDataStore.getState()
      const watchlist = mergeLibrary(local.watchlist, remoteWatchlist, baseline.watchlist, watchlistIdentity)
        .sort((a, b) => b.addedAt - a.addedAt)
      if (watchlist.length > 5000) throw new Error('Merged watchlist exceeds the collection limit')
      const history = mergeLibrary(local.history, remoteHistory, baseline.history, historyIdentity, true)
        .sort((a, b) => b.watchedAt - a.watchedAt).slice(0, 50)
      persistLibrary(watchlist, history, { watchlist: baselineOf(remoteWatchlist, watchlistIdentity), history: baselineOf(remoteHistory, historyIdentity) })
      useUserDataStore.setState({ watchlist, history })
      const pendingChanges = hasLibraryChanges(watchlist, baseline.watchlist, watchlistIdentity)
        || hasLibraryChanges(history, baseline.history, historyIdentity)
      context.watchlist = watchlistSnapshot.revision
      context.history = historySnapshot.revision
      context.needsRead = false
      return pendingChanges
}
