import type { EpisodeTorrentSearchRequest } from '../search/episode-search-policy'
import type { MovieTorrentSearchRequest } from '../search/movie-search-policy'
import type { PreferredEpisodeFile } from '../torrent/episode-file-policy'

const INFO_HASH_RE = /^[a-f0-9]{40}$/i
const BASE32_HASH_RE = /^[a-z2-7]{32}$/i
const MAX_MAGNET_LENGTH = 16_384
const MAX_SEARCH_LENGTH = 200

export function requireInfoHash(value: unknown): string {
  if (typeof value !== 'string' || !INFO_HASH_RE.test(value)) {
    throw new TypeError('Invalid torrent info hash')
  }
  return value.toLowerCase()
}

export function requireMagnetURI(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_MAGNET_LENGTH) {
    throw new TypeError('Invalid magnet URI')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new TypeError('Invalid magnet URI')
  }

  const exactTopic = parsed.searchParams.getAll('xt')
    .find((topic) => topic.toLowerCase().startsWith('urn:btih:'))
  const hash = exactTopic?.slice('urn:btih:'.length) ?? ''

  if (parsed.protocol !== 'magnet:' || (!INFO_HASH_RE.test(hash) && !BASE32_HASH_RE.test(hash))) {
    throw new TypeError('Magnet URI must contain a valid BitTorrent info hash')
  }
  return value
}

export function requireFileIndex(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100_000) {
    throw new TypeError('Invalid torrent file index')
  }
  return value
}

export function requirePreferredEpisodeFile(value: unknown): PreferredEpisodeFile {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Invalid preferred episode file')
  }
  const request = value as Record<string, unknown>
  const seasonNumber = request.seasonNumber
  const episodeNumber = request.episodeNumber
  if (typeof seasonNumber !== 'number' || !Number.isSafeInteger(seasonNumber) || seasonNumber < 0 || seasonNumber > 999) {
    throw new TypeError('Invalid preferred season number')
  }
  if (typeof episodeNumber !== 'number' || !Number.isSafeInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 999) {
    throw new TypeError('Invalid preferred episode number')
  }
  return { seasonNumber, episodeNumber }
}

export function requireFiniteNumber(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`Invalid ${name}`)
  }
  return value
}

export function requireSearchQuery(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Invalid search query')
  const query = value.trim()
  if (query.length < 2 || query.length > MAX_SEARCH_LENGTH) {
    throw new TypeError(`Search query must be between 2 and ${MAX_SEARCH_LENGTH} characters`)
  }
  return query
}

export function requireCatalogId(value: unknown, name = 'catalog ID'): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new TypeError(`Invalid ${name}`)
  }
  return value
}

export function requireMovieCatalogId(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:cinemeta:tt\d{5,12}|yts:\d{1,10})$/i.test(value)) {
    throw new TypeError('Invalid movie catalog ID')
  }
  return value.toLowerCase()
}

export function requireEpisodeSearchRequest(value: unknown): EpisodeTorrentSearchRequest {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Invalid episode search request')
  }
  const request = value as Record<string, unknown>
  const seriesTitle = requireSearchQuery(request.seriesTitle)
  const seasonNumber = request.seasonNumber
  const episodeNumber = request.episodeNumber
  if (typeof seasonNumber !== 'number' || !Number.isSafeInteger(seasonNumber) || seasonNumber < 0 || seasonNumber > 999) {
    throw new TypeError('Invalid season number')
  }
  if (typeof episodeNumber !== 'number' || !Number.isSafeInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 999) {
    throw new TypeError('Invalid episode number')
  }

  let episodeTitle: string | undefined
  if (request.episodeTitle !== undefined && request.episodeTitle !== null) {
    if (typeof request.episodeTitle !== 'string') throw new TypeError('Invalid episode title')
    const normalizedTitle = request.episodeTitle.trim()
    if (normalizedTitle.length > MAX_SEARCH_LENGTH) throw new TypeError('Invalid episode title')
    episodeTitle = normalizedTitle || undefined
  }

  return { seriesTitle, seasonNumber, episodeNumber, episodeTitle }
}

export function requireMovieSearchRequest(value: unknown): MovieTorrentSearchRequest {
  if (typeof value !== 'object' || value === null) throw new TypeError('Invalid movie search request')
  const request = value as Record<string, unknown>
  const title = requireSearchQuery(request.title)
  let year: number | undefined
  if (request.year !== undefined && request.year !== null) {
    if (typeof request.year !== 'number' || !Number.isSafeInteger(request.year) || request.year < 1888 || request.year > 2200) {
      throw new TypeError('Invalid movie year')
    }
    year = request.year
  }
  return { title, year }
}
