export type TorrentProviderName = 'APIBay' | 'Nyaa' | 'YTS' | 'EZTV' | 'Torznab'

export interface SourceProviderConfig {
  imdbId?: string
  torznabUrl?: string
  torznabApiKey?: string
}

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

const INFO_HASH_PATTERN = /^[a-fA-F0-9]{40}$/

export const TRACKERS = [
  // TCP-based fallbacks are important on networks that block UDP/DHT.
  'http://tracker.bt4g.com:2095/announce',
  'http://tracker.qu.ax:6969/announce',
  'http://tracker2.dler.org:80/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.openbittorrent.com:80/announce',
  'udp://explodie.org:6969/announce',
  'wss://tracker.webtorrent.dev:443',
  'wss://tracker.openwebtorrent.com:443',
  'wss://open.ftorrent.com:443',
  'wss://tracker.btorrent.xyz:443'
]

export function appendFallbackTrackers(magnetURI: string): string {
  let magnet: URL
  try {
    magnet = new URL(magnetURI)
  } catch {
    return magnetURI
  }
  if (magnet.protocol !== 'magnet:') return magnetURI

  const existing = new Set(magnet.searchParams.getAll('tr'))
  for (const tracker of TRACKERS) {
    if (!existing.has(tracker)) magnet.searchParams.append('tr', tracker)
  }
  return magnet.toString()
}

export function normalizeInfoHash(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return INFO_HASH_PATTERN.test(normalized) ? normalized : null
}

export function extractInfoHashFromMagnet(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.match(/(?:^|[?&])xt=urn:btih:([a-fA-F0-9]{40})(?:&|$)/i)
  return normalizeInfoHash(match?.[1])
}

export function buildMagnetURI(infoHash: string, name: string): string | null {
  const hash = normalizeInfoHash(infoHash)
  if (!hash) return null

  const trackerParams = TRACKERS.map((tracker) => `&tr=${encodeURIComponent(tracker)}`).join('')
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name.trim())}${trackerParams}`
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, unitIndex)).toFixed(unitIndex > 1 ? 1 : 0)} ${units[unitIndex]}`
}

export function parseFileSize(value: string): number {
  const match = value.trim().match(/^([\d.]+)\s*(B|KiB|MiB|GiB|TiB|KB|MB|GB|TB)$/i)
  if (!match) return 0

  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount < 0) return 0

  const powers: Record<string, number> = {
    B: 0,
    KB: 1,
    KIB: 1,
    MB: 2,
    MIB: 2,
    GB: 3,
    GIB: 3,
    TB: 4,
    TIB: 4
  }
  return Math.round(amount * Math.pow(1024, powers[match[2].toUpperCase()]))
}

export function decodeXmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim()
}

export function sourceQualityScore(result: TorrentSearchResult): number {
  const name = result.name.toLowerCase()
  const seedScore = Math.log10(Math.max(1, result.seeders) + 1) * 30
  const ratioScore = Math.min(20, result.seeders / Math.max(1, result.leechers + 1) * 2)
  const categoryBonus = /movie|video|tv|anime/i.test(result.category) ? 8 : 0
  const resolutionBonus = /1080p/.test(name) ? 10 : /2160p|4k/.test(name) ? 8 : /720p/.test(name) ? 5 : 0
  const directPlayBonus = /h\.?264|x264|avc/.test(name) && /aac|mp3|opus/.test(name) ? 14 : 0
  const compatibilityPenalty = /hevc|h\.?265|x265|ac3|eac3|dts/.test(name) ? 6 : 0
  const deadPenalty = result.seeders === 0 ? 50 : 0
  return Math.round(seedScore + ratioScore + categoryBonus + resolutionBonus + directPlayBonus - compatibilityPenalty - deadPenalty)
}

/** Order sources by swarm availability, using quality only to break seed-count ties. */
export function compareTorrentSourcesBySeeders(
  left: TorrentSearchResult,
  right: TorrentSearchResult
): number {
  return right.seeders - left.seeders
    || (right.qualityScore ?? sourceQualityScore(right))
      - (left.qualityScore ?? sourceQualityScore(left))
    || left.leechers - right.leechers
    || left.name.localeCompare(right.name)
}

export function deduplicateResults(results: TorrentSearchResult[]): TorrentSearchResult[] {
  const byHash = new Map<string, TorrentSearchResult>()

  for (const result of results) {
    const hash = extractInfoHashFromMagnet(result.magnetURI)
    if (!hash) continue

    const candidate = { ...result, qualityScore: sourceQualityScore(result) }
    const current = byHash.get(hash)
    const currentScore = current?.qualityScore ?? (current ? sourceQualityScore(current) : Number.NEGATIVE_INFINITY)
    if (!current || candidate.seeders > current.seeders
      || (candidate.seeders === current.seeders && candidate.qualityScore > currentScore)) {
      byHash.set(hash, candidate)
    }
  }

  return [...byHash.values()].sort(compareTorrentSourcesBySeeders)
}
