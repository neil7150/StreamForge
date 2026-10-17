import type { EpisodeTorrentSearchRequest, MovieTorrentSearchRequest, PreferredEpisodeFile } from './torrent'

const INFO_HASH_RE = /^[a-f0-9]{40}$/i
const BASE32_HASH_RE = /^[a-z2-7]{32}$/i
const MAX_MAGNET_LENGTH = 16_384
const MAX_SEARCH_LENGTH = 200

function requireOptionalSourceConfig(request: Record<string, unknown>): {
  imdbId?: string
  torznabUrl?: string
  torznabApiKey?: string
  torznabEndpoints?: Array<{ url: string; apiKey?: string }>
  stremioAddonUrls?: string[]
  torrentioEnabled?: boolean
} {
  let imdbId: string | undefined
  if (request.imdbId !== undefined && request.imdbId !== null && request.imdbId !== '') {
    if (typeof request.imdbId !== 'string' || !/^tt\d{5,12}$/i.test(request.imdbId.trim())) {
      throw new TypeError('Invalid IMDb ID')
    }
    imdbId = request.imdbId.trim().toLowerCase()
  }

  let torznabUrl: string | undefined
  if (request.torznabUrl !== undefined && request.torznabUrl !== null && request.torznabUrl !== '') {
    if (typeof request.torznabUrl !== 'string' || request.torznabUrl.length > 2048) {
      throw new TypeError('Invalid Torznab URL')
    }
    let parsed: URL
    try { parsed = new URL(request.torznabUrl.trim()) } catch { throw new TypeError('Invalid Torznab URL') }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
      throw new TypeError('Invalid Torznab URL')
    }
    torznabUrl = parsed.toString()
  }

  let torznabApiKey: string | undefined
  if (request.torznabApiKey !== undefined && request.torznabApiKey !== null && request.torznabApiKey !== '') {
    if (typeof request.torznabApiKey !== 'string' || request.torznabApiKey.length > 512) {
      throw new TypeError('Invalid Torznab API key')
    }
    torznabApiKey = request.torznabApiKey.trim() || undefined
  }

  let torznabEndpoints: Array<{ url: string; apiKey?: string }> | undefined
  if (request.torznabEndpoints !== undefined && request.torznabEndpoints !== null) {
    if (!Array.isArray(request.torznabEndpoints) || request.torznabEndpoints.length > 8) {
      throw new TypeError('Invalid Torznab endpoints')
    }
    torznabEndpoints = request.torznabEndpoints.map((value) => {
      if (typeof value !== 'object' || value === null) throw new TypeError('Invalid Torznab endpoint')
      const endpoint = value as Record<string, unknown>
      if (typeof endpoint.url !== 'string' || endpoint.url.length > 2048) {
        throw new TypeError('Invalid Torznab URL')
      }
      let parsed: URL
      try { parsed = new URL(endpoint.url.trim()) } catch { throw new TypeError('Invalid Torznab URL') }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
        throw new TypeError('Invalid Torznab URL')
      }
      let apiKey: string | undefined
      if (endpoint.apiKey !== undefined && endpoint.apiKey !== null && endpoint.apiKey !== '') {
        if (typeof endpoint.apiKey !== 'string' || endpoint.apiKey.length > 512) {
          throw new TypeError('Invalid Torznab API key')
        }
        apiKey = endpoint.apiKey.trim() || undefined
      }
      return { url: parsed.toString(), ...(apiKey ? { apiKey } : {}) }
    })
  }

  let stremioAddonUrls: string[] | undefined
  if (request.stremioAddonUrls !== undefined && request.stremioAddonUrls !== null) {
    if (!Array.isArray(request.stremioAddonUrls) || request.stremioAddonUrls.length > 8) {
      throw new TypeError('Invalid Stremio addon URLs')
    }
    stremioAddonUrls = request.stremioAddonUrls.map((value) => {
      if (typeof value !== 'string' || value.length > 2048) throw new TypeError('Invalid Stremio addon URL')
      let parsed: URL
      try { parsed = new URL(value.trim()) } catch { throw new TypeError('Invalid Stremio addon URL') }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
        throw new TypeError('Invalid Stremio addon URL')
      }
      if (!/\/manifest\.json\/?$/i.test(parsed.pathname)) throw new TypeError('Stremio addon URL must end in manifest.json')
      return parsed.toString()
    })
  }

  let torrentioEnabled: boolean | undefined
  if (request.torrentioEnabled !== undefined && request.torrentioEnabled !== null) {
    if (typeof request.torrentioEnabled !== 'boolean') {
      throw new TypeError('Invalid torrentioEnabled')
    }
    torrentioEnabled = request.torrentioEnabled
  }

  return {
    ...(imdbId ? { imdbId } : {}),
    ...(torznabUrl ? { torznabUrl } : {}),
    ...(torznabApiKey ? { torznabApiKey } : {}),
    ...(torznabEndpoints?.length ? { torznabEndpoints } : {}),
    ...(stremioAddonUrls?.length ? { stremioAddonUrls } : {}),
    ...(torrentioEnabled !== undefined ? { torrentioEnabled } : {})
  }
}

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
  let fileIndex: number | undefined
  if (request.fileIndex !== undefined) fileIndex = requireFileIndex(request.fileIndex)
  let absoluteEpisodeNumber: number | undefined
  if (request.absoluteEpisodeNumber !== undefined) {
    if (typeof request.absoluteEpisodeNumber !== 'number' || !Number.isSafeInteger(request.absoluteEpisodeNumber)
      || request.absoluteEpisodeNumber < 1 || request.absoluteEpisodeNumber > 9999) {
      throw new TypeError('Invalid preferred absolute episode number')
    }
    absoluteEpisodeNumber = request.absoluteEpisodeNumber
  }
  if (request.absoluteEpisodeOnly === true && absoluteEpisodeNumber === undefined) {
    throw new TypeError('Absolute-only episode selection requires an absolute episode number')
  }
  let seriesTitles: string[] | undefined
  if (request.seriesTitles !== undefined) {
    if (!Array.isArray(request.seriesTitles) || request.seriesTitles.length > 12) throw new TypeError('Invalid preferred series titles')
    seriesTitles = request.seriesTitles.map((title) => requireSearchQuery(title))
  }
  return {
    seasonNumber,
    episodeNumber,
    ...(fileIndex !== undefined ? { fileIndex } : {}),
    ...(absoluteEpisodeNumber ? { absoluteEpisodeNumber } : {}),
    ...(request.absoluteEpisodeOnly === true ? { absoluteEpisodeOnly: true } : {}),
    ...(seriesTitles ? { seriesTitles } : {})
  }
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

  let seriesAliases: string[] | undefined
  if (request.seriesAliases !== undefined) {
    if (!Array.isArray(request.seriesAliases) || request.seriesAliases.length > 12) throw new TypeError('Invalid series aliases')
    seriesAliases = request.seriesAliases.map((alias) => requireSearchQuery(alias))
  }
  let absoluteEpisodeNumber: number | undefined
  if (request.absoluteEpisodeNumber !== undefined) {
    if (typeof request.absoluteEpisodeNumber !== 'number' || !Number.isSafeInteger(request.absoluteEpisodeNumber)
      || request.absoluteEpisodeNumber < 1 || request.absoluteEpisodeNumber > 9999) {
      throw new TypeError('Invalid absolute episode number')
    }
    absoluteEpisodeNumber = request.absoluteEpisodeNumber
  }
  if (request.absoluteEpisodeOnly === true && absoluteEpisodeNumber === undefined) {
    throw new TypeError('Absolute-only episode search requires an absolute episode number')
  }

  return {
    seriesTitle, seasonNumber, episodeNumber, episodeTitle,
    ...(seriesAliases ? { seriesAliases } : {}),
    ...(absoluteEpisodeNumber ? { absoluteEpisodeNumber } : {}),
    ...(request.absoluteEpisodeOnly === true ? { absoluteEpisodeOnly: true } : {}),
    ...requireOptionalSourceConfig(request)
  }
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
  return { title, year, ...requireOptionalSourceConfig(request) }
}
