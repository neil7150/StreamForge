import type { TorrentSearchResult } from '../../../../packages/core/src/types/torrent'
import { extractInfoHashFromMagnet } from '../../../../packages/core/src/search/provider-policy'
import { formatBytes } from '../../../../packages/core/src/utils/utils'

/** Reject invalid catalog entries before they can reach the native torrent engine. */
export function catalogSources(value: unknown, title: string): TorrentSearchResult[] {
  if (!Array.isArray(value)) throw new Error('Invalid catalog sources response')
  const seen = new Set<string>()
  return value.map((entry): TorrentSearchResult | null => {
    if (!entry || typeof entry !== 'object') return null
    const item = entry as Record<string, unknown>
    const hash = extractInfoHashFromMagnet(item.magnet_uri)
    if (!hash || seen.has(hash)) return null
    seen.add(hash)
    const size = typeof item.file_size_bytes === 'number' && Number.isSafeInteger(item.file_size_bytes) && item.file_size_bytes >= 0 ? item.file_size_bytes : 0
    const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
    return {
      id: typeof item.id === 'string' ? item.id : hash,
      name: `${title}${typeof item.quality === 'string' ? ` [${item.quality}]` : ''}`,
      magnetURI: item.magnet_uri as string,
      seeders: count(item.seed_count), leechers: count(item.peer_count),
      size: size > 0 ? formatBytes(size) : 'Unknown', sizeBytes: size,
      category: 'Video', added: typeof item.created_at === 'string' ? item.created_at : '',
      provider: 'StreamForge'
    }
  }).filter((source): source is TorrentSearchResult => source !== null)
}

export async function episodeSources(options: {
  catalogEpisodeId?: string
  title: string
  signal: AbortSignal
  getMagnets: (id: string, signal: AbortSignal) => Promise<{ data: unknown }>
  search: () => Promise<{ results: TorrentSearchResult[] }>
}): Promise<TorrentSearchResult[]> {
  const checkCancelled = () => { if (options.signal.aborted) throw new Error('Source request cancelled') }
  checkCancelled()
  if (options.catalogEpisodeId) {
    const response = await options.getMagnets(options.catalogEpisodeId, options.signal)
    checkCancelled()
    const sources = catalogSources(response.data, options.title)
    if (sources.length) return sources
  }
  checkCancelled()
  const response = await options.search()
  checkCancelled()
  return response.results
}
