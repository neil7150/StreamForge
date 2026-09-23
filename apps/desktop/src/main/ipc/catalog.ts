import { ipcMain } from 'electron'
import { TVMazeClient } from '../metadata/tvmaze-client'
import { MovieCatalogClient } from '../metadata/movie-catalog-client'
import { AniListClient } from '../metadata/anilist-client'
import { requireCatalogId, requireMovieCatalogId, requireSearchQuery } from './validation'

export function registerCatalogHandlers(
  client = new TVMazeClient(),
  movieClient = new MovieCatalogClient(),
  animeClient = new AniListClient()
): void {
  ipcMain.handle('catalog:search-series', async (_, query: string) => (
    client.searchSeries(requireSearchQuery(query))
  ))

  ipcMain.handle('catalog:popular-series', async () => client.getPopularSeries())

  ipcMain.handle('catalog:get-series', async (_, seriesId: number) => (
    client.getSeries(requireCatalogId(seriesId, 'series ID'))
  ))

  ipcMain.handle('catalog:get-seasons', async (_, seriesId: number) => (
    client.getSeasons(requireCatalogId(seriesId, 'series ID'))
  ))

  ipcMain.handle('catalog:get-season-episodes', async (_, seasonId: number) => (
    client.getSeasonEpisodes(requireCatalogId(seasonId, 'season ID'))
  ))

  ipcMain.handle('catalog:get-anime-search-metadata', async (_, title: string) => (
    animeClient.getAnimeSearchMetadata(requireSearchQuery(title))
  ))

  ipcMain.handle('catalog:search-movies', async (_, query: string) => (
    movieClient.searchMovies(requireSearchQuery(query))
  ))

  ipcMain.handle('catalog:popular-movies', async () => movieClient.getPopularMovies())

  ipcMain.handle('catalog:get-movie', async (_, movieId: string) => (
    movieClient.getMovie(requireMovieCatalogId(movieId))
  ))
}
