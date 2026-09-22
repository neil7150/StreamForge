import type {
  TorrentProviderName,
  TorrentSearchResult,
  TorrentProviderStatus,
  TorrentSearchResponse
} from '../types/torrent'

export type {
  TorrentProviderName,
  TorrentSearchResult,
  TorrentProviderStatus,
  TorrentSearchResponse
}

export interface TorznabEndpoint {
  url: string
  apiKey?: string
}

export interface SourceProviderConfig {
  imdbId?: string
  torznabUrl?: string
  torznabApiKey?: string
  torznabEndpoints?: TorznabEndpoint[]
  stremioAddonUrls?: string[]
  seasonNumber?: number
  episodeNumber?: number
}


const INFO_HASH_PATTERN = /^[a-fA-F0-9]{40}$/

export const TRACKERS = [
  // Tier-1 High-Uptime Public BitTorrent Trackers (ngosang / newTrackon curated)
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.tracker.cl:1337/announce',
  'udp://9.rarbg.com:2810/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://tracker.openbittorrent.com:80/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  // HTTP / HTTPS Fallback Trackers
  'https://tracker.gbitt.info/announce',
  'http://tracker.bt4g.com:2095/announce',
  'http://tracker.qu.ax:6969/announce',
  'http://tracker2.dler.org:80/announce',
  // WebTorrent / WebRTC Hybrid Trackers
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
  // URLSearchParams percent-encodes the colons in `urn:btih:`. The magnet-uri
  // parser used by WebTorrent expects this exact topic prefix to remain literal.
  return magnet.toString()
    .replace(/([?&]xt=)urn%3Abtih%3A/gi, '$1urn:btih:')
    .replace(/([?&]xt=)urn%3Abtmh%3A/gi, '$1urn:btmh:')
}

export function normalizeInfoHash(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return INFO_HASH_PATTERN.test(normalized) ? normalized : null
}

export function extractInfoHashFromMagnet(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const magnet = new URL(value)
    const exactTopic = magnet.searchParams.getAll('xt')
      .find((topic) => topic.toLowerCase().startsWith('urn:btih:'))
    const parsedHash = normalizeInfoHash(exactTopic?.slice('urn:btih:'.length))
    if (parsedHash) return parsedHash
  } catch {
    // Fall through to the tolerant raw-string matcher.
  }
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
  const resolutionBonus = /1080p|fhd/.test(name) ? 14 : /2160p|4k|uhd/.test(name) ? 12 : /720p|hd/.test(name) ? 8 : 0
  const directPlayBonus = /h\.?264|x264|avc/.test(name) && /aac|mp3|opus/.test(name) ? 14 : 0
  const releaseBonus = /web[- .]?dl|webrip|bluray|blu-ray/i.test(name) ? 10 : 0
  const camPenalty = /\b(cam|hd-cam|camrip|telesync|ts|hdts|telecine|tc|screener|scr|dvdscr|r5)\b/i.test(name) ? 100 : 0
  const deadPenalty = result.seeders === 0 ? 50 : 0
  return Math.round(seedScore + ratioScore + categoryBonus + resolutionBonus + directPlayBonus + releaseBonus - camPenalty - deadPenalty)
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
