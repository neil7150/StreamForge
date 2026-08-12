import { net } from 'electron'
import {
  buildMagnetURI,
  decodeXmlText,
  deduplicateResults,
  formatFileSize,
  normalizeInfoHash,
  parseFileSize,
  type TorrentProviderName,
  type SourceProviderConfig,
  type TorrentProviderStatus,
  type TorrentSearchResponse,
  type TorrentSearchResult
} from './provider-policy'
import { ProviderHealthTracker, SearchResponseCache } from './provider-resilience'
import { fetchJSONWithFailover } from './provider-endpoints'

type UnknownRecord = Record<string, unknown>

interface ProviderOutcome {
  results: TorrentSearchResult[]
  status: TorrentProviderStatus
}

const PROVIDER_TIMEOUT_MS = 8_000
const providerHealth = new ProviderHealthTracker()
const searchCache = new SearchResponseCache()
const inFlightSearches = new Map<string, Promise<TorrentSearchResponse>>()
const YTS_BASE_URLS = ['https://yts.bz', 'https://yts.gg', 'https://yts.lt', 'https://yts.am', 'https://yts.ag']
let preferredYTSBaseURL = YTS_BASE_URLS[0]

const CATEGORY_MAP: Record<string, string> = {
  '100': 'Audio',
  '101': 'Music',
  '200': 'Video',
  '201': 'Movies',
  '202': 'TV',
  '205': 'TV',
  '207': 'HD Movies',
  '208': 'HD TV',
  '300': 'Apps',
  '301': 'Windows',
  '400': 'Games',
  '500': 'Adult',
  '600': 'Other',
  '601': 'E-Books',
  '602': 'Comics',
  '603': 'Pictures'
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asDisplayString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function asNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function formatUnixDate(value: unknown): string {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function providerErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return 'Request timed out'
    }
    if (/fetch failed|ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(error.message)) {
      return 'Provider address could not be reached'
    }
    return error.message
  }
  return 'Unknown provider error'
}

async function runProvider(
  name: TorrentProviderName,
  operation: () => Promise<TorrentSearchResult[]>
): Promise<ProviderOutcome> {
  const gate = providerHealth.canRequest(name)
  if (!gate.allowed) {
    return {
      results: [],
      status: {
        name,
        status: 'cooldown',
        count: 0,
        error: 'Temporarily paused after repeated failures',
        latencyMs: 0,
        consecutiveFailures: gate.consecutiveFailures,
        retryAt: gate.retryAt
      }
    }
  }

  const startedAt = Date.now()
  try {
    const results = await operation()
    const latencyMs = Date.now() - startedAt
    providerHealth.recordSuccess(name, latencyMs)
    console.log(`[SearchProvider] ${name} returned ${results.length} result(s) in ${latencyMs}ms`)
    return {
      results,
      status: { name, status: 'ok', count: results.length, latencyMs, consecutiveFailures: 0 }
    }
  } catch (error) {
    const latencyMs = Date.now() - startedAt
    const health = providerHealth.recordFailure(name, latencyMs)
    const message = providerErrorMessage(error)
    console.warn(`[SearchProvider] ${name} failed: ${message}`)
    return {
      results: [],
      status: {
        name,
        status: 'error',
        count: 0,
        error: message,
        latencyMs,
        consecutiveFailures: health.consecutiveFailures,
        retryAt: health.circuitOpenUntil || undefined
      }
    }
  }
}

async function fetchJSON(url: string): Promise<unknown> {
  const response = await providerFetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

function providerFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  // Chromium's network service handles a few provider TLS/CDN paths that
  // Node's undici client resets. Unit-test and non-Electron callers retain fetch.
  if (process.versions.electron) return net.fetch(input instanceof URL ? input.toString() : input, init)
  return fetch(input, init)
}

async function searchAPIBay(query: string): Promise<TorrentSearchResult[]> {
  const payload = await fetchJSON(`https://apibay.org/q.php?q=${encodeURIComponent(query)}`)
  if (!Array.isArray(payload)) throw new Error('Invalid response')

  const results: TorrentSearchResult[] = []
  for (const value of payload) {
    const item = asRecord(value)
    if (!item || item.name === 'No results returned') continue

    const hash = normalizeInfoHash(item.info_hash)
    const name = asString(item.name).trim()
    if (!hash || !name || /^0+$/.test(hash)) continue

    const magnetURI = buildMagnetURI(hash, name)
    if (!magnetURI) continue

    const sizeBytes = Math.round(asNumber(item.size))
    const categoryId = asString(item.category)
    results.push({
      id: `apibay-${asString(item.id) || hash}`,
      name,
      magnetURI,
      seeders: Math.round(asNumber(item.seeders)),
      leechers: Math.round(asNumber(item.leechers)),
      size: formatFileSize(sizeBytes),
      sizeBytes,
      category: CATEGORY_MAP[categoryId] || 'Other',
      added: formatUnixDate(item.added),
      provider: 'APIBay'
    })
  }
  return results
}

function readXmlTag(itemXml: string, tag: string): string {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = itemXml.match(new RegExp(`<${escapedTag}>([\\s\\S]*?)<\\/${escapedTag}>`, 'i'))
  return match ? decodeXmlText(match[1]) : ''
}

async function searchNyaa(query: string): Promise<TorrentSearchResult[]> {
  const response = await providerFetch(`https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const xml = await response.text()
  if (!/<rss[\s>]/i.test(xml)) throw new Error('Invalid RSS response')

  const results: TorrentSearchResult[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let itemMatch: RegExpExecArray | null

  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const itemXml = itemMatch[1]
    const hash = normalizeInfoHash(readXmlTag(itemXml, 'nyaa:infoHash'))
    const name = readXmlTag(itemXml, 'title')
    if (!hash || !name) continue

    const magnetURI = buildMagnetURI(hash, name)
    if (!magnetURI) continue

    const size = readXmlTag(itemXml, 'nyaa:size') || '0 B'
    const published = readXmlTag(itemXml, 'pubDate')
    const publishedDate = published ? new Date(published) : null

    results.push({
      id: `nyaa-${hash}`,
      name,
      magnetURI,
      seeders: Math.round(asNumber(readXmlTag(itemXml, 'nyaa:seeders'))),
      leechers: Math.round(asNumber(readXmlTag(itemXml, 'nyaa:leechers'))),
      size,
      sizeBytes: parseFileSize(size),
      category: readXmlTag(itemXml, 'nyaa:category') || 'Anime',
      added: publishedDate && Number.isFinite(publishedDate.getTime())
        ? publishedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : '',
      provider: 'Nyaa'
    })
  }

  return results
}

async function searchYTS(query: string): Promise<TorrentSearchResult[]> {
  const endpoints = [preferredYTSBaseURL, ...YTS_BASE_URLS.filter((url) => url !== preferredYTSBaseURL)]
  const { payload: rawPayload, endpoint } = await fetchJSONWithFailover(
    endpoints,
    `/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}`,
    providerFetch
  )
  preferredYTSBaseURL = endpoint
  const payload = asRecord(rawPayload)
  const data = asRecord(payload?.data)
  const movies = data?.movies
  if (movies === undefined) return []
  if (!Array.isArray(movies)) throw new Error('Invalid response')

  const results: TorrentSearchResult[] = []
  for (const movieValue of movies) {
    const movie = asRecord(movieValue)
    if (!movie || !Array.isArray(movie.torrents)) continue

    const movieTitle = asString(movie.title).trim()
    for (const torrentValue of movie.torrents) {
      const torrent = asRecord(torrentValue)
      if (!torrent) continue

      const hash = normalizeInfoHash(torrent.hash)
      const quality = asString(torrent.quality).trim()
      const name = `${movieTitle}${quality ? ` [${quality}]` : ''}`.trim()
      if (!hash || !name) continue

      const magnetURI = buildMagnetURI(hash, name)
      if (!magnetURI) continue

      const sizeBytes = Math.round(asNumber(torrent.size_bytes))
      results.push({
        id: `yts-${asString(movie.id) || 'movie'}-${hash}`,
        name,
        magnetURI,
        seeders: Math.round(asNumber(torrent.seeds)),
        leechers: Math.round(asNumber(torrent.peers)),
        size: asString(torrent.size) || formatFileSize(sizeBytes),
        sizeBytes,
        category: 'Movies',
        added: asDisplayString(movie.year),
        provider: 'YTS'
      })
    }
  }
  return results
}

async function searchEZTV(_query: string, config: SourceProviderConfig): Promise<TorrentSearchResult[]> {
  const imdbNumber = config.imdbId?.replace(/^tt/i, '')
  if (!imdbNumber) return []
  const payload = asRecord(await fetchJSON(`https://eztvx.to/api/get-torrents?limit=100&imdb_id=${encodeURIComponent(imdbNumber)}`))
  if (!payload || !Array.isArray(payload.torrents)) throw new Error('Invalid response')

  const results: TorrentSearchResult[] = []
  for (const value of payload.torrents) {
    const item = asRecord(value)
    if (!item) continue
    const hash = normalizeInfoHash(item.hash)
    const name = (asString(item.title) || asString(item.filename)).trim()
    if (!hash || !name) continue
    const magnetURI = asString(item.magnet_url).startsWith('magnet:')
      ? asString(item.magnet_url)
      : buildMagnetURI(hash, name)
    if (!magnetURI) continue
    const sizeBytes = Math.round(asNumber(item.size_bytes))
    results.push({
      id: `eztv-${asDisplayString(item.id) || hash}`,
      name,
      magnetURI,
      seeders: Math.round(asNumber(item.seeds)),
      leechers: Math.round(asNumber(item.peers)),
      size: formatFileSize(sizeBytes),
      sizeBytes,
      category: 'TV',
      added: formatUnixDate(item.date_released_unix),
      provider: 'EZTV'
    })
  }
  return results
}

function readTorznabAttribute(itemXml: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = itemXml.match(new RegExp(`<(?:torznab|newznab):attr[^>]+name=["']${escaped}["'][^>]+value=["']([^"']*)["'][^>]*>`, 'i'))
    ?? itemXml.match(new RegExp(`<(?:torznab|newznab):attr[^>]+value=["']([^"']*)["'][^>]+name=["']${escaped}["'][^>]*>`, 'i'))
  return match ? decodeXmlText(match[1]) : ''
}

function torznabCategoryLabel(value: string): string {
  const category = Number(value)
  if (category >= 5000 && category < 6000) return 'TV'
  if (category >= 2000 && category < 3000) return 'Movies'
  return value || 'Video'
}

async function searchTorznab(query: string, config: SourceProviderConfig): Promise<TorrentSearchResult[]> {
  if (!config.torznabUrl) return []
  const url = new URL(config.torznabUrl)
  url.searchParams.set('t', 'search')
  url.searchParams.set('q', query)
  url.searchParams.set('attrs', 'infohash,magneturl,seeders,peers,size,category')
  if (config.torznabApiKey) url.searchParams.set('apikey', config.torznabApiKey)
  const response = await providerFetch(url, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const xml = await response.text()
  if (!/<(?:rss|channel)[\s>]/i.test(xml)) throw new Error('Invalid Torznab response')

  const results: TorrentSearchResult[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let itemMatch: RegExpExecArray | null
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const itemXml = itemMatch[1]
    const name = readXmlTag(itemXml, 'title')
    const hash = normalizeInfoHash(readTorznabAttribute(itemXml, 'infohash'))
    const magnetValue = readTorznabAttribute(itemXml, 'magneturl') || readXmlTag(itemXml, 'link')
    const magnetURI = magnetValue.startsWith('magnet:') ? magnetValue : (hash ? buildMagnetURI(hash, name) : null)
    if (!name || !magnetURI) continue
    const sizeBytes = Math.round(asNumber(readTorznabAttribute(itemXml, 'size') || readXmlTag(itemXml, 'size')))
    const published = readXmlTag(itemXml, 'pubDate')
    const publishedDate = published ? new Date(published) : null
    results.push({
      id: `torznab-${hash || results.length}`,
      name,
      magnetURI,
      seeders: Math.round(asNumber(readTorznabAttribute(itemXml, 'seeders'))),
      leechers: Math.round(asNumber(readTorznabAttribute(itemXml, 'peers') || readTorznabAttribute(itemXml, 'leechers'))),
      size: formatFileSize(sizeBytes),
      sizeBytes,
      category: torznabCategoryLabel(readTorznabAttribute(itemXml, 'category')),
      added: publishedDate && Number.isFinite(publishedDate.getTime())
        ? publishedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : '',
      provider: 'Torznab'
    })
  }
  return results
}

const PROVIDER_SEARCHES: Record<TorrentProviderName, (query: string, config: SourceProviderConfig) => Promise<TorrentSearchResult[]>> = {
  APIBay: searchAPIBay,
  Nyaa: searchNyaa,
  YTS: searchYTS,
  EZTV: searchEZTV,
  Torznab: searchTorznab
}

async function executeProviderSearch(
  query: string,
  cacheKey: string,
  providers: TorrentProviderName[],
  config: SourceProviderConfig
): Promise<TorrentSearchResponse> {
  const outcomes = await Promise.all(providers.map((name) => (
    runProvider(name, () => PROVIDER_SEARCHES[name](query, config))
  )))

  const response: TorrentSearchResponse = {
    results: deduplicateResults(outcomes.flatMap((outcome) => outcome.results)),
    providers: outcomes.map((outcome) => outcome.status),
    cache: 'miss'
  }

  if (response.providers.some((provider) => provider.status === 'ok')) {
    searchCache.set(cacheKey, response)
    return response
  }

  const stale = searchCache.getStale(cacheKey)
  if (stale && stale.response.results.length > 0) {
    return { results: stale.response.results, providers: response.providers, cache: 'stale' }
  }

  return response
}

export async function searchTorrentProviders(
  query: string,
  providers: TorrentProviderName[] = ['APIBay', 'Nyaa', 'YTS'],
  config: SourceProviderConfig = {}
): Promise<TorrentSearchResponse> {
  const uniqueProviders = [...new Set(providers)]
  const cacheKey = `${uniqueProviders.join(',')}:${config.imdbId || ''}:${config.torznabUrl || ''}:${query}`
  const fresh = searchCache.getFresh(cacheKey)
  if (fresh) {
    return {
      ...fresh.response,
      providers: fresh.response.providers.map((provider) => ({ ...provider, fromCache: true })),
      cache: 'fresh'
    }
  }

  const key = SearchResponseCache.key(cacheKey)
  const existing = inFlightSearches.get(key)
  if (existing) return existing

  const pending = executeProviderSearch(query, cacheKey, uniqueProviders, config)
    .finally(() => inFlightSearches.delete(key))
  inFlightSearches.set(key, pending)
  return pending
}
