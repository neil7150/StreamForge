import type { TorrentSearchResponse, TorrentSearchResult } from './provider-policy'
import { searchTorrentProviders } from './provider-search'
import {
  buildMovieSearchQuery,
  matchesMovieRelease,
  type MovieTorrentSearchRequest
} from './movie-search-policy'

export type { MovieTorrentSearchRequest } from './movie-search-policy'

function isVideoResult(result: TorrentSearchResult): boolean {
  const value = `${result.category} ${result.name}`.toLowerCase()
  return /movie|video|anime|1080p|2160p|720p|bluray|web[- .]?dl|webrip|h\.?264|h\.?265|x264|x265/.test(value)
    && !/\b(app|software|game|music|audio book|xxx|adult)\b/.test(result.category.toLowerCase())
}

export async function searchMovieTorrentProviders(
  request: MovieTorrentSearchRequest
): Promise<TorrentSearchResponse> {
  const response = await searchTorrentProviders(
    buildMovieSearchQuery(request),
    ['APIBay', 'Nyaa', 'YTS', ...(request.torznabUrl ? ['Torznab' as const] : [])],
    request
  )
  const results = response.results.filter((result) => (
    isVideoResult(result) && matchesMovieRelease(result, request)
  ))
  return {
    ...response,
    results,
    providers: response.providers.map((provider) => ({
      ...provider,
      count: results.filter((result) => result.provider === provider.name).length
    }))
  }
}
