/**
 * Torrent search is performed by the Electron main process. Keeping provider
 * requests out of the renderer avoids browser CORS failures and lets the UI
 * report partial provider outages instead of silently showing no results.
 */

export type TorrentProviderName = 'APIBay' | 'Nyaa' | 'YTS' | 'EZTV' | 'Torznab'

export interface TorrentSearchResult {
  id: string
  name: string
  magnetURI: string
  seeders: number
  leechers: number
  size: string
  sizeBytes: number
  category: string
  added: string
  provider: TorrentProviderName
  qualityScore?: number
}

export interface TorrentProviderStatus {
  name: TorrentProviderName
  status: 'ok' | 'error' | 'cooldown'
  count: number
  error?: string
  latencyMs?: number
  consecutiveFailures?: number
  retryAt?: number
  fromCache?: boolean
}

export interface TorrentSearchResponse {
  results: TorrentSearchResult[]
  providers: TorrentProviderStatus[]
  cache?: 'miss' | 'fresh' | 'stale'
}

export async function searchTorrents(query: string): Promise<TorrentSearchResponse> {
  const safeQuery = query.trim()
  if (!safeQuery) return { results: [], providers: [] }
  return window.torrentAPI.searchTorrents(safeQuery)
}
