import assert from 'node:assert/strict'
import test from 'node:test'
import { CinemetaMovieClient, MovieCatalogClient, type MovieSummary } from '../src/main/metadata/movie-catalog-client.ts'

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

const primaryMovie: MovieSummary = {
  id: 'cinemeta:tt0137523',
  title: 'Fight Club',
  year: 1999,
  posterUrl: 'https://images.example/fight-club.jpg',
  rating: 8.8,
  genres: ['Drama'],
  language: null,
  imdbId: 'tt0137523'
}

test('normalizes Cinemeta movie searches and details', async () => {
  const urls: string[] = []
  const client = new CinemetaMovieClient({ fetchImpl: async (input) => {
    const url = String(input)
    urls.push(url)
    if (url.includes('/catalog/')) {
      return response({ metas: [{ id: 'tt0137523', name: 'Fight Club', releaseInfo: '1999', poster: 'http://images.example/poster.jpg' }] })
    }
    return response({ meta: { id: 'tt0137523', name: 'Fight Club', releaseInfo: '1999', imdbRating: '8.8', genres: ['Crime', 'Drama'], runtime: '2h 19min', description: 'Overview', background: 'https://images.example/backdrop.jpg' } })
  } })

  const movies = await client.searchMovies('Fight Club')
  const details = await client.getMovie('tt0137523')
  assert.equal(urls[0], 'https://v3-cinemeta.strem.io/catalog/movie/top/search=Fight%20Club.json')
  assert.equal(urls[1], 'https://v3-cinemeta.strem.io/meta/movie/tt0137523.json')
  assert.equal(movies[0].id, 'cinemeta:tt0137523')
  assert.equal(movies[0].posterUrl, 'https://images.example/poster.jpg')
  assert.equal(details.runtimeMinutes, 139)
  assert.equal(details.summary, 'Overview')
})

test('uses YTS when the primary movie catalog is unavailable', async () => {
  const client = new MovieCatalogClient({
    primary: {
      searchMovies: async () => { throw new Error('offline') },
      getMovie: async () => { throw new Error('offline') }
    },
    fallback: {
      searchMovies: async () => [{ ...primaryMovie, id: 7 }],
      getMovie: async (id) => ({ ...primaryMovie, id, summary: 'Fallback', runtimeMinutes: 120, backdropUrl: null, contentRating: null, ytsUrl: null })
    }
  })

  const movies = await client.searchMovies('Fight Club')
  assert.equal(movies[0].id, 'yts:7')
  assert.equal((await client.getMovie('yts:7')).summary, 'Fallback')
})

test('serves a recent successful search when both catalogs later fail', async () => {
  let offline = false
  let now = 1_000
  const client = new MovieCatalogClient({
    now: () => now,
    primary: {
      searchMovies: async () => {
        if (offline) throw new Error('offline')
        return [primaryMovie]
      },
      getMovie: async () => { throw new Error('unused') }
    },
    fallback: {
      searchMovies: async () => { throw new Error('offline') },
      getMovie: async () => { throw new Error('unused') }
    }
  })

  assert.deepEqual(await client.searchMovies('Fight Club'), [primaryMovie])
  offline = true
  now += 60_000
  assert.deepEqual(await client.searchMovies('Fight Club'), [primaryMovie])
})

test('returns no matches instead of an availability error when the primary catalog succeeds empty', async () => {
  const client = new MovieCatalogClient({
    primary: {
      searchMovies: async () => [],
      getMovie: async () => { throw new Error('unused') }
    },
    fallback: {
      searchMovies: async () => { throw new Error('offline') },
      getMovie: async () => { throw new Error('unused') }
    }
  })
  assert.deepEqual(await client.searchMovies('No Such Movie'), [])
})
