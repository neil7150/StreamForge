import { YTSMovieClient, type MovieDetails as YTSMovieDetails, type MovieSummary as YTSMovieSummary } from './yts-movie-client.ts'

type UnknownRecord = Record<string, unknown>

export interface MovieSummary {
  id: string
  title: string
  year: number | null
  posterUrl: string | null
  rating: number | null
  genres: string[]
  language: string | null
  imdbId: string | null
}

export interface MovieDetails extends MovieSummary {
  summary: string | null
  runtimeMinutes: number | null
  backdropUrl: string | null
  contentRating: string | null
  ytsUrl: string | null
}

interface CacheEntry<T> {
  expiresAt: number
  value: T
}

interface CinemetaClientOptions {
  fetchImpl?: typeof fetch
  now?: () => number
}

interface MovieCatalogClientOptions {
  primary?: Pick<CinemetaMovieClient, 'searchMovies' | 'getMovie' | 'getPopularMovies'>
  fallback?: Pick<YTSMovieClient, 'searchMovies' | 'getMovie'>
  now?: () => number
}

const CINEMETA_BASE_URL = 'https://v3-cinemeta.strem.io'
const REQUEST_TIMEOUT_MS = 8_000
const SEARCH_CACHE_TTL_MS = 10 * 60_000
const DETAILS_CACHE_TTL_MS = 60 * 60_000
const STALE_SEARCH_TTL_MS = 24 * 60 * 60_000
const IMDB_ID_PATTERN = /^tt\d{5,12}$/i

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : null
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
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

function normalizeGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((genre) => {
    const normalized = asString(genre)
    return normalized ? [normalized] : []
  })
}

function parseYear(value: unknown): number | null {
  const match = asString(value)?.match(/(?:^|\D)((?:18|19|20|21)\d{2})(?:\D|$)/)
  return match ? Number(match[1]) : null
}

function parseRuntimeMinutes(value: unknown): number | null {
  const runtime = asString(value)?.toLowerCase()
  if (!runtime) return null
  const hourMatch = runtime.match(/(\d+)\s*h/)
  const minuteMatch = runtime.match(/(\d+)\s*m/)
  if (!hourMatch && !minuteMatch) return null
  return Number(hourMatch?.[1] ?? 0) * 60 + Number(minuteMatch?.[1] ?? 0)
}

function normalizeCinemetaMovie(value: unknown): MovieDetails | null {
  const movie = asRecord(value)
  if (!movie) return null
  const imdbId = asString(movie.id)?.toLowerCase() ?? null
  const title = asString(movie.name)
  if (!imdbId || !IMDB_ID_PATTERN.test(imdbId) || !title) return null

  return {
    id: `cinemeta:${imdbId}`,
    title,
    year: parseYear(movie.releaseInfo) ?? parseYear(movie.year),
    posterUrl: safeWebURL(movie.poster),
    rating: asNumber(movie.imdbRating),
    genres: normalizeGenres(movie.genres),
    language: asString(movie.language),
    imdbId,
    summary: asString(movie.description),
    runtimeMinutes: parseRuntimeMinutes(movie.runtime),
    backdropUrl: safeWebURL(movie.background),
    contentRating: asString(movie.certification),
    ytsUrl: null
  }
}

function toSummary(details: MovieDetails): MovieSummary {
  const {
    summary: _summary,
    runtimeMinutes: _runtimeMinutes,
    backdropUrl: _backdropUrl,
    contentRating: _contentRating,
    ytsUrl: _ytsUrl,
    ...summary
  } = details
  return summary
}

function fromYTSSummary(movie: YTSMovieSummary): MovieSummary {
  return { ...movie, id: `yts:${movie.id}` }
}

function fromYTSDetails(movie: YTSMovieDetails): MovieDetails {
  return { ...movie, id: `yts:${movie.id}` }
}

export class CinemetaMovieClient {
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private readonly cache = new Map<string, CacheEntry<unknown>>()
  private readonly inFlight = new Map<string, Promise<unknown>>()

  constructor(options: CinemetaClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? Date.now
  }

  async searchMovies(query: string): Promise<MovieSummary[]> {
    const normalizedQuery = query.trim()
    const key = `cinemeta-search:${normalizedQuery.toLowerCase()}`
    return this.cached(key, SEARCH_CACHE_TTL_MS, async () => {
      const payload = asRecord(await this.request(
        `/catalog/movie/top/search=${encodeURIComponent(normalizedQuery)}.json`
      ))
      if (!Array.isArray(payload?.metas)) throw new Error('Primary movie catalog returned an invalid search response')
      return payload.metas.flatMap((value) => {
        const movie = normalizeCinemetaMovie(value)
        return movie ? [toSummary(movie)] : []
      })
    })
  }

  async getPopularMovies(): Promise<MovieSummary[]> {
    return this.cached('cinemeta-popular', SEARCH_CACHE_TTL_MS, async () => {
      const payload = asRecord(await this.request('/catalog/movie/top.json'))
      if (!Array.isArray(payload?.metas)) throw new Error('Primary movie catalog returned an invalid browse response')
      return payload.metas.slice(0, 30).flatMap((value) => {
        const movie = normalizeCinemetaMovie(value)
        return movie ? [toSummary(movie)] : []
      })
    })
  }

  async getMovie(imdbId: string): Promise<MovieDetails> {
    const normalizedId = imdbId.toLowerCase()
    if (!IMDB_ID_PATTERN.test(normalizedId)) throw new Error('Invalid primary movie catalog ID')
    return this.cached(`cinemeta-movie:${normalizedId}`, DETAILS_CACHE_TTL_MS, async () => {
      const payload = asRecord(await this.request(`/meta/movie/${encodeURIComponent(normalizedId)}.json`))
      const movie = normalizeCinemetaMovie(payload?.meta)
      if (!movie) throw new Error('Primary movie catalog returned invalid movie details')
      return movie
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
    let response: Response
    try {
      response = await this.fetchImpl(`${CINEMETA_BASE_URL}${path}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'StreamForge/0.1 (movie metadata client)' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new Error('Primary movie catalog request timed out')
      }
      throw new Error('Primary movie catalog could not be reached')
    }
    if (!response.ok) throw new Error(`Primary movie catalog request failed with HTTP ${response.status}`)
    try {
      return await response.json()
    } catch {
      throw new Error('Primary movie catalog returned invalid JSON')
    }
  }
}

export class MovieCatalogClient {
  private readonly primary: Pick<CinemetaMovieClient, 'searchMovies' | 'getMovie' | 'getPopularMovies'>
  private readonly fallback: Pick<YTSMovieClient, 'searchMovies' | 'getMovie'>
  private readonly now: () => number
  private readonly staleSearches = new Map<string, CacheEntry<MovieSummary[]>>()

  constructor(options: MovieCatalogClientOptions = {}) {
    this.primary = options.primary ?? new CinemetaMovieClient()
    this.fallback = options.fallback ?? new YTSMovieClient()
    this.now = options.now ?? Date.now
  }

  async searchMovies(query: string): Promise<MovieSummary[]> {
    const key = query.trim().toLowerCase()
    let primaryError: unknown
    let primarySucceeded = false
    try {
      const movies = await this.primary.searchMovies(query)
      primarySucceeded = true
      if (movies.length > 0) {
        this.remember(key, movies)
        return movies
      }
    } catch (error) {
      primaryError = error
      console.warn('[MovieCatalog] Primary search failed; trying fallback:', error)
    }

    try {
      const movies = (await this.fallback.searchMovies(query)).map(fromYTSSummary)
      this.remember(key, movies)
      return movies
    } catch (fallbackError) {
      const stale = this.staleSearches.get(key)
      if (stale && stale.expiresAt > this.now()) return stale.value
      if (primarySucceeded) return []
      console.warn('[MovieCatalog] Fallback search failed:', fallbackError)
      throw primaryError instanceof Error
        ? new Error(`Movie catalogs are unavailable: ${primaryError.message}`)
        : new Error('Movie catalogs are unavailable')
    }
  }

  async getPopularMovies(): Promise<MovieSummary[]> {
    try {
      return await this.primary.getPopularMovies()
    } catch (error) {
      console.warn('[MovieCatalog] Popular movie catalog failed:', error)
      return []
    }
  }

  async getMovie(movieId: string): Promise<MovieDetails> {
    const cinemetaMatch = movieId.match(/^cinemeta:(tt\d{5,12})$/i)
    if (cinemetaMatch) return this.primary.getMovie(cinemetaMatch[1])

    const ytsMatch = movieId.match(/^yts:(\d+)$/i)
    if (ytsMatch) return fromYTSDetails(await this.fallback.getMovie(Number(ytsMatch[1])))
    throw new Error('Invalid movie catalog ID')
  }

  private remember(key: string, movies: MovieSummary[]): void {
    if (movies.length === 0) return
    this.staleSearches.set(key, { value: movies, expiresAt: this.now() + STALE_SEARCH_TTL_MS })
  }
}
