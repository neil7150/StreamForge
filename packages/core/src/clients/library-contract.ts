export interface LibraryMetadata {
  slug?: string
  magnetURI?: string
  infoHash?: string
  streamURL?: string
  seriesTitle?: string
  episodeTitle?: string
  year?: number
  rating?: number
  fileIndex?: number
  seasonNumber?: number
  episodeNumber?: number
  contentType?: 'movie' | 'series' | 'episode'
  catalogId?: string | number
}

export interface CloudWatchlistItem {
  content_key: string
  title: string
  poster_url?: string
  added_at: string
  metadata: LibraryMetadata
}

export interface CloudHistoryItem {
  content_key: string
  title: string
  poster_url?: string
  watched_at: string
  progress: number
  current_time?: number
  duration?: number
  metadata: LibraryMetadata
}

export interface LibrarySnapshot<T> { items: T[]; revision: number }

export function librarySnapshot<T extends CloudWatchlistItem | CloudHistoryItem>(data: unknown, kind: 'watchlist' | 'history'): LibrarySnapshot<T> {
  if (!data || typeof data !== 'object') throw new Error('Invalid cloud library response')
  const value = data as LibrarySnapshot<T>
  if (!Array.isArray(value.items) || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('Invalid cloud library revision or items')
  if (value.items.length > (kind === 'history' ? 50 : 5000)) throw new Error('Cloud library exceeds the supported size')
  const keys = new Set<string>()
  for (const item of value.items) {
    if (!item || typeof item.content_key !== 'string' || !item.content_key.trim() || keys.has(item.content_key)
      || typeof item.title !== 'string' || (item.poster_url !== undefined && typeof item.poster_url !== 'string')
      || !item.metadata || typeof item.metadata !== 'object' || Array.isArray(item.metadata)) throw new Error('Invalid cloud library item')
    keys.add(item.content_key)
    const metadata = item.metadata as Record<string, unknown>
    for (const key of ['slug', 'magnetURI', 'infoHash', 'streamURL', 'seriesTitle', 'episodeTitle']) {
      if (metadata[key] !== undefined && typeof metadata[key] !== 'string') throw new Error('Invalid cloud source metadata')
    }
    for (const key of ['year', 'rating', 'fileIndex', 'seasonNumber', 'episodeNumber']) {
      if (metadata[key] !== undefined && (typeof metadata[key] !== 'number' || !Number.isFinite(metadata[key]) || (metadata[key] as number) < 0)) throw new Error('Invalid cloud numeric metadata')
    }
    if (metadata.contentType !== undefined && !['movie', 'series', 'episode'].includes(metadata.contentType as string)) throw new Error('Invalid cloud content type')
    if (metadata.catalogId !== undefined && typeof metadata.catalogId !== 'string' && (typeof metadata.catalogId !== 'number' || !Number.isFinite(metadata.catalogId))) throw new Error('Invalid cloud catalog identity')
    const timestamp = kind === 'watchlist' ? (item as CloudWatchlistItem).added_at : (item as CloudHistoryItem).watched_at
    if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp)) || Date.parse(timestamp) < 0) throw new Error('Invalid cloud library timestamp')
    if (kind === 'history') {
      const h = item as CloudHistoryItem
      if (!Number.isFinite(h.progress) || h.progress < 0 || h.progress > 1) throw new Error('Invalid cloud playback progress')
      for (const n of [h.current_time, h.duration]) if (n !== undefined && (!Number.isFinite(n) || n < 0 || n >= 1e8)) throw new Error('Invalid cloud playback time')
    }
  }
  return value
}

export function syncRevision(data: unknown, expected: number): number {
  const revision = (data as { revision?: number } | null)?.revision
  if (!Number.isSafeInteger(revision) || revision !== expected + 1) throw new Error('Invalid cloud sync acknowledgement')
  return revision!
}
