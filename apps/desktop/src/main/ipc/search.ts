import { ipcMain } from 'electron'
import { requireEpisodeSearchRequest, requireMovieSearchRequest, requireSearchQuery } from './validation'
import { searchTorrentProviders } from '../search/provider-search'
import { searchEpisodeTorrentProviders } from '../search/episode-search'
import { searchMovieTorrentProviders } from '../search/movie-search'

export function registerSearchHandlers(): void {
  ipcMain.handle('search:torrents', async (_, query: string) => {
    const safeQuery = requireSearchQuery(query)
    return searchTorrentProviders(safeQuery)
  })

  ipcMain.handle('search:episode-torrents', async (_, request: unknown) => (
    searchEpisodeTorrentProviders(requireEpisodeSearchRequest(request))
  ))

  ipcMain.handle('search:movie-torrents', async (_, request: unknown) => (
    searchMovieTorrentProviders(requireMovieSearchRequest(request))
  ))
}
