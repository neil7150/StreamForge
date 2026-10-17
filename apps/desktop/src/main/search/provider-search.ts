import { session } from 'electron'
import {
  buildMagnetURI,
  decodeXmlText,
  deduplicateResults,
  extractInfoHashFromMagnet,
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
import { fetchJSONWithFailover, fetchTextWithFailover } from './provider-endpoints'
import {
  escapeInternetArchiveQuery,
  parse1337xDetailMagnet,
  parse1337xSearchList,
  parseAniDexFeed,
  parseAnimeToshoPayload,
  parseInternetArchivePayload,
  parseKnabenPayload,
  parseStremioStreamPayload,
  parseSubsPleasePayload,
  parseTokyoToshoFeed,
  parseTorrentsCsvPayload
} from './provider-parsers'
import { adaptTorrentsCsvQueries } from './episode-search-policy'
import { enrichPlaceholderSwarmCounts } from './tracker-scraper'

type UnknownRecord = Record<string, unknown>

interface ProviderOutcome {
  results: TorrentSearchResult[]
  status: TorrentProviderStatus
}

const PROVIDER_TIMEOUT_MS = 8_000
const providerHealth = new ProviderHealthTracker()
const searchCache = new SearchResponseCache()
const inFlightSearches = new Map<string, Promise<TorrentSearchResponse>>()
const YTS_BASE_URLS = ['https://yts.mx', 'https://yts.bz', 'https://yts.lt', 'https://yts.am', 'https://yts.rs']
let preferredYTSBaseURL = YTS_BASE_URLS[0]
const TOKYO_TOSHO_BASE_URLS = ['https://tokyotosho.info', 'https://www.tokyotosho.info']
let preferredTokyoToshoBaseURL = TOKYO_TOSHO_BASE_URLS[0]
// Never add a mirror without checking that its search page contains real result rows.
// 1337x.is is a parked "domain for sale" page that returns HTTP 200 with ad scripts.
const X1337_BASE_URLS = ['https://1337x.to', 'https://1337x.st']
let preferred1337xBaseURL = X1337_BASE_URLS[0]
const ANIDEX_BASE_URLS = ['https://anidex.info']
let preferredAniDexBaseURL = ANIDEX_BASE_URLS[0]

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

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function fetchJSON(url: string): Promise<unknown> {
  const response = await providerFetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/**
 * Dedicated in-memory Electron session for provider scraping.
 * The partition name has no 'persist:' prefix, so it never touches disk, and the
 * HTTP cache is disabled as well. This keeps scraped torrent-site HTML/JS out of
 * AppData\Roaming\streamforge-desktop\Cache\Cache_Data\, which would otherwise
 * trigger Windows Defender false positives on embedded ad scripts.
 *
 * Lazy-initialized because session.fromPartition() requires app.isReady().
 * Provider searches only happen after UI interaction, so this is always safe.
 */
let _scraperSession: Electron.Session | null = null
function getScraperSession(): Electron.Session {
  if (!_scraperSession) {
    _scraperSession = session.fromPartition('scraper', { cache: false })
  }
  return _scraperSession
}

function providerFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', BROWSER_USER_AGENT)
  }
  // Session.fetch (NOT net.fetch, which ignores any `session` option and always uses
  // the default disk-cached session) so that:
  // 1. Requests carry an authentic Chrome TLS fingerprint (bypasses Cloudflare)
  // 2. Scraped torrent-site HTML is NEVER written to disk (prevents Defender alerts)
  if (process.versions.electron) {
    return getScraperSession().fetch(
      input instanceof URL ? input.toString() : input as string,
      { ...init, headers }
    )
  }
  return fetch(input, { ...init, headers })
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
  const fetchFromNyaa = async (baseUrl: string): Promise<TorrentSearchResult[]> => {
    const response = await providerFetch(`${baseUrl}/?page=rss&q=${encodeURIComponent(query)}`, {
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

  try {
    return await fetchFromNyaa('https://nyaa.si')
  } catch {
    // If nyaa.si is blocked or times out, failover seamlessly to AnimeTosho (which mirrors all Nyaa content)
    try {
      const fallback = await searchAnimeTosho(query)
      return fallback.map((item) => ({ ...item, provider: 'Nyaa' as const }))
    } catch {
      // Both Nyaa and its fallback failed — throw so the circuit breaker records this as a real failure
      throw new Error('Nyaa and AnimeTosho fallback both failed')
    }
  }
}

async function searchAnimeTosho(query: string): Promise<TorrentSearchResult[]> {
  const payload = await fetchJSON(`https://feed.animetosho.org/json?q=${encodeURIComponent(query)}&only_tor=1`)
  return parseAnimeToshoPayload(payload)
}

async function searchKnaben(query: string): Promise<TorrentSearchResult[]> {
  const response = await providerFetch('https://api.knaben.org/v1', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      search_type: '100%',
      search_field: 'title',
      query,
      order_by: 'seeders',
      order_direction: 'desc',
      from: 0,
      size: 100,
      hide_unsafe: true,
      hide_xxx: true
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parseKnabenPayload(await response.json())
}

const PUBLIC_TORRENTIO_MANIFEST_URL = 'https://torrentio.strem.fun/manifest.json'

function stremioStreamURL(manifestURL: string, videoId: string): string {
  const url = new URL(manifestURL)
  url.pathname = url.pathname.replace(/\/?manifest\.json\/?$/i, '').replace(/\/$/, '')
    + `/stream/series/${videoId}.json`
  return url.toString()
}

async function searchStremioAddons(_query: string, config: SourceProviderConfig): Promise<TorrentSearchResult[]> {
  if (!config.imdbId || config.seasonNumber === undefined || config.episodeNumber === undefined) return []
  const userEndpoints = config.stremioAddonUrls ?? []
  const includeTorrentio = config.torrentioEnabled !== false
  const endpoints = [
    ...userEndpoints,
    ...(includeTorrentio && !userEndpoints.includes(PUBLIC_TORRENTIO_MANIFEST_URL) ? [PUBLIC_TORRENTIO_MANIFEST_URL] : [])
  ]
  if (endpoints.length === 0) return []
  const videoId = `${config.imdbId}:${config.seasonNumber}:${config.episodeNumber}`
  const searches = await Promise.allSettled(endpoints.map(async (endpoint, index) => (
    parseStremioStreamPayload(await fetchJSON(stremioStreamURL(endpoint, videoId)), index)
  )))
  const results = searches
    .filter((result): result is PromiseFulfilledResult<TorrentSearchResult[]> => result.status === 'fulfilled')
    .flatMap((result) => result.value)
  if (searches.length > 0 && searches.every((result) => result.status === 'rejected')) {
    const failure = searches[0] as PromiseRejectedResult
    throw failure.reason instanceof Error ? failure.reason : new Error('All Stremio addon endpoints failed')
  }
  return deduplicateResults(results)
}

async function searchTokyoTosho(query: string): Promise<TorrentSearchResult[]> {
  const endpoints = [
    preferredTokyoToshoBaseURL,
    ...TOKYO_TOSHO_BASE_URLS.filter((url) => url !== preferredTokyoToshoBaseURL)
  ]
  const { text, endpoint } = await fetchTextWithFailover(
    endpoints,
    `/rss.php?filter=1&terms=${encodeURIComponent(query)}`,
    providerFetch
  )
  preferredTokyoToshoBaseURL = endpoint
  return parseTokyoToshoFeed(text)
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

const EZTV_BASE_URLS = ['https://eztvx.to', 'https://eztv.wf', 'https://eztv.re', 'https://eztv.tf']
let preferredEZTVBaseURL = EZTV_BASE_URLS[0]

async function searchEZTV(_query: string, config: SourceProviderConfig): Promise<TorrentSearchResult[]> {
  const imdbNumber = config.imdbId?.replace(/^tt/i, '')
  if (!imdbNumber) return []
  const endpoints = [preferredEZTVBaseURL, ...EZTV_BASE_URLS.filter((url) => url !== preferredEZTVBaseURL)]
  let rawPayload: unknown
  try {
    const { payload, endpoint } = await fetchJSONWithFailover(
      endpoints,
      `/api/get-torrents?limit=100&imdb_id=${encodeURIComponent(imdbNumber)}`,
      providerFetch
    )
    preferredEZTVBaseURL = endpoint
    rawPayload = payload
  } catch (error) {
    // Re-throw so the circuit breaker records this as a real failure
    // (previously returned [] which masked outages and showed 0 results instead of 'error')
    throw error
  }

  const payload = asRecord(rawPayload)
  if (!payload || !Array.isArray(payload.torrents)) {
    // A valid JSON response with no torrents is a legitimate empty result, not an error
    return []
  }

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
  const endpoints = config.torznabEndpoints?.length
    ? config.torznabEndpoints
    : (config.torznabUrl ? [{ url: config.torznabUrl, apiKey: config.torznabApiKey }] : [])
  if (endpoints.length === 0) return []
  const searches = await Promise.allSettled(endpoints.map(async (endpoint) => {
    const url = new URL(endpoint.url)
    url.searchParams.set('t', 'search')
    url.searchParams.set('q', query)
    url.searchParams.set('attrs', 'infohash,magneturl,seeders,peers,size,category')
    if (endpoint.apiKey) url.searchParams.set('apikey', endpoint.apiKey)
    const response = await providerFetch(url, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
    })
    if (!response.ok) throw new Error(`${url.host} returned HTTP ${response.status}`)
    return response.text()
  }))
  const feeds = searches
    .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((xml) => /<(?:rss|channel)[\s>]/i.test(xml))
  if (feeds.length === 0) {
    const firstFailure = searches.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    throw firstFailure?.reason instanceof Error ? firstFailure.reason : new Error('All Torznab endpoints failed')
  }

  const results: TorrentSearchResult[] = []
  for (const xml of feeds) {
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
  }
  return deduplicateResults(results)
}

async function searchInternetArchive(query: string): Promise<TorrentSearchResult[]> {
  const title = escapeInternetArchiveQuery(query.replace(/\s+(?:18|19|20|21)\d{2}\s*$/, '').trim())
  const search = `title:(\"${title}\") AND mediatype:movies AND btih:*`
  const params = new URLSearchParams({ q: search, rows: '50', page: '1', output: 'json' })
  for (const field of ['identifier', 'title', 'downloads', 'item_size', 'date', 'btih']) {
    params.append('fl[]', field)
  }
  const payload = await fetchJSON(`https://archive.org/advancedsearch.php?${params.toString()}`)
  return parseInternetArchivePayload(payload)
}

async function search1337x(query: string): Promise<TorrentSearchResult[]> {
  const endpoints = [
    preferred1337xBaseURL,
    ...X1337_BASE_URLS.filter((url) => url !== preferred1337xBaseURL)
  ]
  const { text, endpoint } = await fetchTextWithFailover(
    endpoints,
    `/search/${encodeURIComponent(query)}/1/`,
    providerFetch
  )
  preferred1337xBaseURL = endpoint
  const items = parse1337xSearchList(text)
  if (items.length === 0) return []

  const topItems = items.slice(0, 10)
  const detailPromises = topItems.map(async (item): Promise<TorrentSearchResult | null> => {
    try {
      const detailUrl = `${endpoint}${item.detailPath.startsWith('/') ? '' : '/'}${item.detailPath}`
      const response = await providerFetch(detailUrl, {
        signal: AbortSignal.timeout(6_000)
      })
      if (!response.ok) return null
      const detailHtml = await response.text()
      const magnetURI = parse1337xDetailMagnet(detailHtml)
      if (!magnetURI) return null
      const hash = extractInfoHashFromMagnet(magnetURI) || item.detailPath
      return {
        id: `1337x-${hash}`,
        name: item.title,
        magnetURI,
        seeders: item.seeders,
        leechers: item.leechers,
        size: item.size,
        sizeBytes: item.sizeBytes,
        category: item.category,
        added: item.added,
        provider: '1337x'
      }
    } catch {
      return null
    }
  })

  const resolved = await Promise.all(detailPromises)
  return resolved.filter((res): res is TorrentSearchResult => res !== null)
}

async function searchSubsPlease(query: string): Promise<TorrentSearchResult[]> {
  const url = `https://subsplease.org/api/?f=search&tz=UTC&s=${encodeURIComponent(query)}`
  const payload = await fetchJSON(url)
  return parseSubsPleasePayload(payload)
}

async function searchAniDex(query: string): Promise<TorrentSearchResult[]> {
  const endpoints = [
    preferredAniDexBaseURL,
    ...ANIDEX_BASE_URLS.filter((url) => url !== preferredAniDexBaseURL)
  ]
  const { text, endpoint } = await fetchTextWithFailover(
    endpoints,
    `/rss/?q=${encodeURIComponent(query)}`,
    providerFetch
  )
  preferredAniDexBaseURL = endpoint
  return parseAniDexFeed(text)
}

async function searchTorrentsCSV(query: string): Promise<TorrentSearchResult[]> {
  const queries = adaptTorrentsCsvQueries(query)
  if (queries.length === 1) {
    const payload = await fetchJSON(`https://torrents-csv.com/service/search?q=${encodeURIComponent(query)}`)
    return parseTorrentsCsvPayload(payload)
  }

  const outcomes = await Promise.allSettled(
    queries.map(async (q) => {
      const payload = await fetchJSON(`https://torrents-csv.com/service/search?q=${encodeURIComponent(q)}`)
      return parseTorrentsCsvPayload(payload)
    })
  )

  const fulfilled = outcomes.filter((r): r is PromiseFulfilledResult<TorrentSearchResult[]> => r.status === 'fulfilled')
  if (fulfilled.length === 0) {
    const rejected = outcomes.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    throw rejected?.reason instanceof Error ? rejected.reason : new Error('Torrents-CSV search failed')
  }

  return deduplicateResults(fulfilled.flatMap((r) => r.value))
}

/*
 * Keep provider functions explicit: each has independent health and cooldown state,
 * while Torznab aggregates the user's configured Prowlarr/Jackett endpoints.
 */
const PROVIDER_SEARCHES: Record<TorrentProviderName, (query: string, config: SourceProviderConfig) => Promise<TorrentSearchResult[]>> = {
  APIBay: searchAPIBay,
  Nyaa: searchNyaa,
  AnimeTosho: searchAnimeTosho,
  TokyoTosho: searchTokyoTosho,
  SubsPlease: searchSubsPlease,
  AniDex: searchAniDex,
  YTS: searchYTS,
  EZTV: searchEZTV,
  Knaben: searchKnaben,
  Torznab: searchTorznab,
  StremioAddon: searchStremioAddons,
  InternetArchive: searchInternetArchive,
  '1337x': search1337x,
  TorrentsCSV: searchTorrentsCSV
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

  let flatResults = outcomes.flatMap((outcome) => outcome.results)
  flatResults = await enrichPlaceholderSwarmCounts(flatResults)

  const response: TorrentSearchResponse = {
    results: deduplicateResults(flatResults),
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
  const torznabUrls = config.torznabEndpoints?.map((endpoint) => endpoint.url).join('|') || config.torznabUrl || ''
  const addonUrls = config.stremioAddonUrls?.join('|') || ''
  const torrentioKey = config.torrentioEnabled !== false ? 'tio:1' : 'tio:0'
  const cacheKey = `${uniqueProviders.join(',')}:${config.imdbId || ''}:${torznabUrls}:${addonUrls}:${torrentioKey}:${config.seasonNumber ?? ''}:${config.episodeNumber ?? ''}:${query}`
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
