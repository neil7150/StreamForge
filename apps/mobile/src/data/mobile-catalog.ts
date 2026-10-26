import { CinemetaMovieClient } from '../../../../packages/core/src/clients/movie-catalog-client'
import { tvmazeClient } from '../../../../packages/core/src/clients/tvmaze-client'
import type { MovieSummary, MovieDetails, SeriesSummary } from '../../../../packages/core/src/types/torrent'

type Movies = Pick<CinemetaMovieClient, 'getPopularMovies' | 'searchMovies' | 'getMovie'>
type Shows = Pick<typeof tvmazeClient, 'getPopularSeries' | 'searchSeries'>

export function tvmazeSeriesId(id: string | number | undefined, slug: string): number | null {
  const value = typeof id === 'number' ? id : /^tvmaze:(\d+)$/.exec(slug)?.[1]
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function movieCard(movie: MovieSummary) {
  return { ...movie, slug: movie.id, type: 'movie' as const, poster_url: movie.posterUrl,
    avg_rating: movie.rating, imdb_id: movie.imdbId }
}
function showCard(show: SeriesSummary) {
  return { ...show, slug: `tvmaze:${show.id}`, type: 'show' as const,
    poster_url: show.posterUrl, avg_rating: show.rating, imdb_id: show.imdbId }
}
export type MobileCatalogItem = ReturnType<typeof movieCard> | ReturnType<typeof showCard>

export function searchSections(items: MobileCatalogItem[]) {
  return [
    { title: 'Movies', data: items.filter(item => item.type === 'movie') },
    { title: 'TV Show', data: items.filter(item => item.type === 'show') }
  ].filter(section => section.data.length > 0)
}
function check(signal?: AbortSignal) { if (signal?.aborted) throw new Error('Catalog request cancelled') }

/** Direct, public metadata only. This adapter has no account/backend API client. */
export function createMobileCatalog(movies: Movies, shows: Shows) {
  return {
    async getPopularMovies(signal?: AbortSignal) {
      check(signal)
      const data = (await movies.getPopularMovies()).map(movieCard)
      check(signal)
      return { data }
    },
    async getMovies(page = 1, limit = 24, genre?: string, signal?: AbortSignal) {
      check(signal)
      const data = (await movies.getPopularMovies()).map(movieCard).filter(movie => !genre || movie.genres.some(value => value.toLowerCase() === genre.toLowerCase()))
      check(signal)
      return { data: data.slice((page - 1) * limit, page * limit) }
    },
    async getShows(page = 1, limit = 24, genre?: string, signal?: AbortSignal) {
      check(signal)
      const data = (await shows.getPopularSeries()).map(showCard).filter(show => !genre || show.genres.some(value => value.toLowerCase() === genre.toLowerCase()))
      check(signal)
      return { data: data.slice((page - 1) * limit, page * limit) }
    },
    async getGenres() {
      const lists = await Promise.allSettled([movies.getPopularMovies(), shows.getPopularSeries()])
      const genres = lists.flatMap(list => list.status === 'fulfilled' ? list.value.flatMap(item => item.genres) : [])
      return { data: [...new Set(genres)].sort().map(name => ({ id: name.toLowerCase(), slug: name.toLowerCase(), name })) }
    },
    async getMovieBySlug(slug: string, signal?: AbortSignal) {
      check(signal)
      const match = /^cinemeta:(tt\d{5,12})$/i.exec(slug)
      if (!match) throw new Error('This saved movie uses an older catalog. Find it again using Search.')
      const movie: MovieDetails = await movies.getMovie(match[1])
      check(signal)
      return { data: { ...movieCard(movie), backdrop_url: movie.backdropUrl, overview: movie.summary, runtime_minutes: movie.runtimeMinutes } }
    },
    async search(query: string, _type = 'all', _page = 1, signal?: AbortSignal) {
      check(signal)
      const [movieResults, showResults] = await Promise.allSettled([movies.searchMovies(query), shows.searchSeries(query)])
      check(signal)
      if (movieResults.status === 'rejected' && showResults.status === 'rejected') throw new Error('Metadata providers are unavailable')
      return {
        data: [...(movieResults.status === 'fulfilled' ? movieResults.value.slice(0, 30).map(movieCard) : []),
          ...(showResults.status === 'fulfilled' ? showResults.value.slice(0, 30).map(showCard) : [])],
        warning: movieResults.status === 'rejected' || showResults.status === 'rejected' ? 'Some metadata providers could not be reached. Results may be incomplete.' : null
      }
    },
    async searchSuggest(query: string, signal?: AbortSignal) {
      const response = await this.search(query, 'all', 1, signal)
      return { data: response.data.slice(0, 6) }
    }
  }
}

export const mobileCatalog = createMobileCatalog(new CinemetaMovieClient(), tvmazeClient)
