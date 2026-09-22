import { deduplicateResults, type TorrentProviderStatus, type TorrentSearchResponse, type TorrentSearchResult } from './provider-policy'
import { searchTorrentProviders } from './provider-search'
import {
  buildEpisodeSearchQuery,
  buildAnimeAbsoluteSearchQueries,
  buildAnimeBatchSearchQueries,
  matchesEpisodeRelease,
  type EpisodeTorrentSearchRequest
} from './episode-search-policy'

export type { EpisodeTorrentSearchRequest } from './episode-search-policy'

function isVideoResult(result: TorrentSearchResult): boolean {
  const value = `${result.category} ${result.name}`.toLowerCase()
  return /movie|video|tv|anime|1080p|2160p|720p|web[- .]?dl|webrip|h\.?264|h\.?265|x264|x265/.test(value)
    && !/\b(app|software|game|music|audio book|xxx|adult)\b/.test(result.category.toLowerCase())
}

export async function searchEpisodeTorrentProviders(
  request: EpisodeTorrentSearchRequest
): Promise<TorrentSearchResponse> {
  const torznabEnabled = Boolean(request.torznabEndpoints?.length || request.torznabUrl)
  const optionalTorznab = torznabEnabled ? ['Torznab' as const] : []
  const optionalStremioAddon = request.imdbId && request.stremioAddonUrls?.length
    ? ['StremioAddon' as const]
    : []
  const standardPromise = request.absoluteEpisodeOnly ? Promise.resolve(null) : searchTorrentProviders(
    buildEpisodeSearchQuery(request),
    ['Knaben', '1337x', 'APIBay', 'Nyaa', 'EZTV', ...optionalTorznab, ...optionalStremioAddon],
    request
  )
  const animeQueries = buildAnimeAbsoluteSearchQueries(request)
  const animePromise = Promise.all(animeQueries.map((query) => searchTorrentProviders(
    query,
    ['SubsPlease', 'AnimeTosho', '1337x', 'AniDex', 'Knaben', 'APIBay', 'Nyaa', 'TokyoTosho', ...optionalTorznab],
    request
  )))
  const batchPromise = Promise.all(
    buildAnimeBatchSearchQueries(request).map((query) => searchTorrentProviders(
      query,
      ['SubsPlease', 'AnimeTosho', '1337x', 'AniDex', 'Knaben', 'APIBay', 'Nyaa', 'TokyoTosho', ...optionalTorznab],
      request
    ))
  )
  const [standardResponse, animeResponses, batchResponses] = await Promise.all([
    standardPromise,
    animePromise,
    batchPromise
  ])
  const responses = [...(standardResponse ? [standardResponse] : []), ...animeResponses, ...batchResponses]
  const combinedStatuses = new Map<TorrentProviderStatus['name'], TorrentProviderStatus>()
  for (const response of responses) {
    for (const status of response.providers) {
      const current = combinedStatuses.get(status.name)
      if (!current || (current.status !== 'ok' && status.status === 'ok')) combinedStatuses.set(status.name, status)
    }
  }
  const results = deduplicateResults(responses.flatMap((response) => response.results).filter((result) => (
    isVideoResult(result) && (result.provider === 'StremioAddon' || matchesEpisodeRelease(result.name, request))
  )))

  return {
    cache: responses.some((response) => response.cache === 'stale') ? 'stale' : 'miss',
    results,
    providers: [...combinedStatuses.values()].map((provider) => ({
      ...provider,
      count: results.filter((result) => result.provider === provider.name).length
    }))
  }
}
