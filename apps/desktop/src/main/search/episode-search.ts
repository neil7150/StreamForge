import type { TorrentSearchResponse, TorrentSearchResult } from './provider-policy'
import { searchTorrentProviders } from './provider-search'
import {
  buildEpisodeSearchQuery,
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
  const response = await searchTorrentProviders(
    buildEpisodeSearchQuery(request),
    ['APIBay', 'Nyaa']
  )
  const results = response.results.filter((result) => (
    isVideoResult(result) && matchesEpisodeRelease(result.name, request)
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
