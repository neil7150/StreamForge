import { fetchJSONWithFailover } from '../search/provider-endpoints'

type UnknownRecord = Record<string, unknown>

export interface YTSMovieSummary {
  id: number
  title: string
  year: number | null
  posterUrl: string | null
  rating: number | null
  genres: string[]
  language: string | null
  imdbId: string | null
}

export interface YTSMovieDetails extends YTSMovieSummary {
  summary: string | null
  runtimeMinutes: number | null
  backdropUrl: string | null
  contentRating: string | null
  ytsUrl: string | null
}

export type MovieSummary = YTSMovieSummary
export type MovieDetails = YTSMovieDetails

interface CacheEntry<T> {
  expiresAt: number
  value: T
}

interface YTSMovieClientOptions {
  fetchImpl?: typeof fetch
  now?: () => number
}

const API_BASE_URLS = ['https://yts.bz/api/v2', 'https://yts.gg/api/v2', 'https://yts.lt/api/v2', 'https://yts.am/api/v2', 'https://yts.ag/api/v2']
const REQUEST_TIMEOUT_MS = 8_000
const SEARCH_CACHE_TTL_MS = 10 * 60_000
const DETAILS_CACHE_TTL_MS = 60 * 60_000

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

function asPositiveInteger(value: unknown): number | null {
  const number = asNumber(value)
  return number !== null && Number.isSafeInteger(number) && number > 0 ? number : null
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

function normalizeMovie(value: unknown): MovieDetails | null {
  const movie = asRecord(value)
  if (!movie) return null
  const id = asPositiveInteger(movie.id)
  const title = asString(movie.title_english) ?? asString(movie.title)
  if (id === null || !title) return null

  const year = asPositiveInteger(movie.year)
  const summary = asString(movie.description_full) ?? asString(movie.summary) ?? asString(movie.synopsis)
  return {
    id,
    title,
    year,
    posterUrl: safeWebURL(movie.medium_cover_image) ?? safeWebURL(movie.large_cover_image),
    rating: asNumber(movie.rating),
    genres: normalizeGenres(movie.genres),
    language: asString(movie.language),
    imdbId: asString(movie.imdb_code),
    summary,
    runtimeMinutes: asPositiveInteger(movie.runtime),
    backdropUrl: safeWebURL(movie.background_image_original) ?? safeWebURL(movie.background_image),
    contentRating: asString(movie.mpa_rating),
    ytsUrl: safeWebURL(movie.url)
  }
}

function toSummary(details: MovieDetails): MovieSummary {
  const {
    summary: _summary,
    runtimeMinutes: _runtimeMinutes,
    backdropUrl: _backdropUrl,
    contentRating: _contentRating,
    ytsUrl: _ytsUrl,
    ...movie
  } = details
  return movie
}

export class YTSMovieClient {
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private readonly cache = new Map<string, CacheEntry<unknown>>()
  private readonly inFlight = new Map<string, Promise<unknown>>()
  private preferredBaseURL = API_BASE_URLS[0]

  constructor(options: YTSMovieClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? Date.now
  }

  async searchMovies(query: string): Promise<MovieSummary[]> {
    const key = `movie-search:${query.trim().toLowerCase()}`
    return this.cached(key, SEARCH_CACHE_TTL_MS, async () => {
      const payload = asRecord(await this.request(
        `/list_movies.json?limit=20&query_term=${encodeURIComponent(query)}`
      ))
      const data = asRecord(payload?.data)
      if (data?.movies === undefined) return []
      if (!Array.isArray(data.movies)) throw new Error('YTS returned an invalid movie search response')
      return data.movies.flatMap((value) => {
        const movie = normalizeMovie(value)
        return movie ? [toSummary(movie)] : []
      })
    })
  }

  async getMovie(movieId: number): Promise<MovieDetails> {
    return this.cached(`movie:${movieId}`, DETAILS_CACHE_TTL_MS, async () => {
      const payload = asRecord(await this.request(
        `/movie_details.json?movie_id=${movieId}&with_images=true&with_cast=false`
      ))
      const movie = normalizeMovie(asRecord(payload?.data)?.movie)
      if (!movie) throw new Error('YTS returned invalid movie details')
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
    try {
      const endpoints = [this.preferredBaseURL, ...API_BASE_URLS.filter((url) => url !== this.preferredBaseURL)]
      const result = await fetchJSONWithFailover(endpoints, path, this.fetchImpl, REQUEST_TIMEOUT_MS)
      this.preferredBaseURL = result.endpoint
      return result.payload
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new Error('Movie catalog request timed out')
      }
      throw new Error('Movie catalog could not be reached')
    }
  }
}
