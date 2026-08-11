type UnknownRecord = Record<string, unknown>

export interface SeriesSummary {
  id: number
  title: string
  posterUrl: string | null
  year: number | null
  status: string | null
  network: string | null
  type: string | null
  language: string | null
  genres: string[]
  rating: number | null
  summary: string | null
  tvmazeUrl: string | null
  imdbId: string | null
}

export interface SeriesDetails extends SeriesSummary {
  premiered: string | null
  ended: string | null
  runtimeMinutes: number | null
  officialSite: string | null
  originalImageUrl: string | null
}

export interface SeasonSummary {
  id: number
  seriesId: number
  number: number
  name: string | null
  episodeCount: number | null
  premiereDate: string | null
  endDate: string | null
  network: string | null
  posterUrl: string | null
  summary: string | null
}

export interface EpisodeSummary {
  id: number
  seasonId: number
  seasonNumber: number
  episodeNumber: number | null
  title: string
  type: string | null
  airDate: string | null
  airStamp: string | null
  runtimeMinutes: number | null
  stillUrl: string | null
  summary: string | null
  tvmazeUrl: string | null
}

interface CacheEntry<T> {
  expiresAt: number
  value: T
}

interface TVMazeClientOptions {
  fetchImpl?: typeof fetch
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}

const API_BASE_URL = 'https://api.tvmaze.com'
const REQUEST_TIMEOUT_MS = 8_000
const MAX_RATE_LIMIT_WAIT_MS = 5_000
const SEARCH_CACHE_TTL_MS = 10 * 60_000
const CATALOG_CACHE_TTL_MS = 60 * 60_000

export class TVMazeClientError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'TVMazeClientError'
    this.status = status
  }
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : null
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const result = value.trim()
  return result || null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asInteger(value: unknown): number | null {
  const number = asNumber(value)
  return number !== null && Number.isSafeInteger(number) ? number : null
}

function asPositiveInteger(value: unknown): number | null {
  const number = asInteger(value)
  return number !== null && number > 0 ? number : null
}

function asNonNegativeInteger(value: unknown): number | null {
  const number = asInteger(value)
  return number !== null && number >= 0 ? number : null
}

function safeWebURL(value: unknown): string | null {
  const rawURL = asString(value)
  if (!rawURL) return null
  try {
    const url = new URL(rawURL)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.protocol === 'http:') url.protocol = 'https:'
    return url.toString()
  } catch {
    return null
  }
}

function nestedString(record: UnknownRecord | null, key: string): string | null {
  return record ? asString(record[key]) : null
}

function imageURL(value: unknown, size: 'medium' | 'original'): string | null {
  return safeWebURL(asRecord(value)?.[size])
}

function networkName(record: UnknownRecord): string | null {
  return nestedString(asRecord(record.network), 'name')
    ?? nestedString(asRecord(record.webChannel), 'name')
}

function decodeHTMLEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"'
  }
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, token: string) => {
    if (token[0] !== '#') return named[token.toLowerCase()] ?? entity
    const hexadecimal = token[1]?.toLowerCase() === 'x'
    const codePoint = Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
    if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity
    try { return String.fromCodePoint(codePoint) } catch { return entity }
  })
}

export function stripTVMazeHTML(value: unknown): string | null {
  const html = asString(value)
  if (!html) return null
  const text = html
    .replace(/<(?:br|\/p)\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
  return decodeHTMLEntities(text).replace(/\s+/g, ' ').trim() || null
}

function normalizeGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((genre) => {
    const normalized = asString(genre)
    return normalized ? [normalized] : []
  })
}

function normalizeSeries(value: unknown): SeriesDetails | null {
  const show = asRecord(value)
  if (!show) return null
  const id = asPositiveInteger(show.id)
  const title = asString(show.name)
  if (id === null || !title) return null

  const premiered = asString(show.premiered)
  const rating = asNumber(asRecord(show.rating)?.average)
  const externals = asRecord(show.externals)

  return {
    id,
    title,
    posterUrl: imageURL(show.image, 'medium'),
    year: premiered && /^\d{4}/.test(premiered) ? Number(premiered.slice(0, 4)) : null,
    status: asString(show.status),
    network: networkName(show),
    type: asString(show.type),
    language: asString(show.language),
    genres: normalizeGenres(show.genres),
    rating,
    summary: stripTVMazeHTML(show.summary),
    tvmazeUrl: safeWebURL(show.url),
    imdbId: externals ? asString(externals.imdb) : null,
    premiered,
    ended: asString(show.ended),
    runtimeMinutes: asPositiveInteger(show.averageRuntime) ?? asPositiveInteger(show.runtime),
    officialSite: safeWebURL(show.officialSite),
    originalImageUrl: imageURL(show.image, 'original')
  }
}

function toSeriesSummary(details: SeriesDetails): SeriesSummary {
  const {
    premiered: _premiered,
    ended: _ended,
    runtimeMinutes: _runtimeMinutes,
    officialSite: _officialSite,
    originalImageUrl: _originalImageUrl,
    ...summary
  } = details
  return summary
}

function normalizeSeason(value: unknown, seriesId: number): SeasonSummary | null {
  const season = asRecord(value)
  if (!season) return null
  const id = asPositiveInteger(season.id)
  const number = asNonNegativeInteger(season.number)
  if (id === null || number === null) return null

  return {
    id,
    seriesId,
    number,
    name: asString(season.name),
    episodeCount: asNonNegativeInteger(season.episodeOrder),
    premiereDate: asString(season.premiereDate),
    endDate: asString(season.endDate),
    network: networkName(season),
    posterUrl: imageURL(season.image, 'medium'),
    summary: stripTVMazeHTML(season.summary)
  }
}

function normalizeEpisode(value: unknown, seasonId: number): EpisodeSummary | null {
  const episode = asRecord(value)
  if (!episode) return null
  const id = asPositiveInteger(episode.id)
  const seasonNumber = asNonNegativeInteger(episode.season)
  const title = asString(episode.name)
  if (id === null || seasonNumber === null || !title) return null

  return {
    id,
    seasonId,
    seasonNumber,
    episodeNumber: asPositiveInteger(episode.number),
    title,
    type: asString(episode.type),
    airDate: asString(episode.airdate),
    airStamp: asString(episode.airstamp),
    runtimeMinutes: asPositiveInteger(episode.runtime),
    stillUrl: imageURL(episode.image, 'original') ?? imageURL(episode.image, 'medium'),
    summary: stripTVMazeHTML(episode.summary),
    tvmazeUrl: safeWebURL(episode.url)
  }
}

function retryAfterMilliseconds(response: Response, now: number): number {
  const retryAfter = response.headers.get('retry-after')?.trim()
  if (!retryAfter) return 1_000
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000
  const date = Date.parse(retryAfter)
  return Number.isFinite(date) ? Math.max(0, date - now) : 1_000
}

export class TVMazeClient {
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly cache = new Map<string, CacheEntry<unknown>>()
  private readonly inFlight = new Map<string, Promise<unknown>>()

  constructor(options: TVMazeClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  }

  async searchSeries(query: string): Promise<SeriesSummary[]> {
    const key = `search:${query.trim().toLocaleLowerCase()}`
    return this.cached(key, SEARCH_CACHE_TTL_MS, async () => {
      const payload = await this.request(`/search/shows?q=${encodeURIComponent(query)}`)
      if (!Array.isArray(payload)) throw new TVMazeClientError('TVmaze returned an invalid search response')
      return payload.flatMap((value) => {
        const show = asRecord(value)?.show
        const normalized = normalizeSeries(show)
        return normalized ? [toSeriesSummary(normalized)] : []
      })
    })
  }

  async getSeries(seriesId: number): Promise<SeriesDetails> {
    return this.cached(`series:${seriesId}`, CATALOG_CACHE_TTL_MS, async () => {
      const normalized = normalizeSeries(await this.request(`/shows/${seriesId}`))
      if (!normalized) throw new TVMazeClientError('TVmaze returned invalid series details')
      return normalized
    })
  }

  async getSeasons(seriesId: number): Promise<SeasonSummary[]> {
    return this.cached(`seasons:${seriesId}`, CATALOG_CACHE_TTL_MS, async () => {
      const payload = await this.request(`/shows/${seriesId}/seasons`)
      if (!Array.isArray(payload)) throw new TVMazeClientError('TVmaze returned an invalid season response')
      return payload.flatMap((value) => {
        const normalized = normalizeSeason(value, seriesId)
        return normalized ? [normalized] : []
      }).sort((left, right) => left.number - right.number)
    })
  }

  async getSeasonEpisodes(seasonId: number): Promise<EpisodeSummary[]> {
    return this.cached(`episodes:${seasonId}`, CATALOG_CACHE_TTL_MS, async () => {
      const payload = await this.request(`/seasons/${seasonId}/episodes`)
      if (!Array.isArray(payload)) throw new TVMazeClientError('TVmaze returned an invalid episode response')
      return payload.flatMap((value) => {
        const normalized = normalizeEpisode(value, seasonId)
        return normalized ? [normalized] : []
      }).sort((left, right) => (left.episodeNumber ?? Number.MAX_SAFE_INTEGER) - (right.episodeNumber ?? Number.MAX_SAFE_INTEGER))
    })
  }

  private async cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key) as CacheEntry<T> | undefined
    if (cached && cached.expiresAt > this.now()) return cached.value

    const existing = this.inFlight.get(key) as Promise<T> | undefined
    if (existing) return existing

    const pending = loader()
      .then((value) => {
        this.cache.set(key, { value, expiresAt: this.now() + ttlMs })
        return value
      })
      .finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, pending)
    return pending
  }

  private async request(path: string): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response
      try {
        response = await this.fetchImpl(`${API_BASE_URL}${path}`, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'StreamForge/0.1 (TV metadata client)'
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        })
      } catch (error) {
        if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
          throw new TVMazeClientError('TVmaze request timed out')
        }
        throw new TVMazeClientError('TVmaze could not be reached')
      }

      if (response.status === 429) {
        const waitMs = Math.min(retryAfterMilliseconds(response, this.now()), MAX_RATE_LIMIT_WAIT_MS)
        if (attempt === 0) {
          await this.sleep(waitMs)
          continue
        }
        throw new TVMazeClientError('TVmaze rate limit reached. Try again shortly.', 429)
      }
      if (!response.ok) {
        const message = response.status === 404
          ? 'The requested TV series data was not found'
          : `TVmaze request failed with HTTP ${response.status}`
        throw new TVMazeClientError(message, response.status)
      }

      try {
        return await response.json()
      } catch {
        throw new TVMazeClientError('TVmaze returned invalid JSON')
      }
    }

    throw new TVMazeClientError('TVmaze request failed')
  }
}
