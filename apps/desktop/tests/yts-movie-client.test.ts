import assert from 'node:assert/strict'
import test from 'node:test'
import { YTSMovieClient } from '../src/main/metadata/yts-movie-client.ts'

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

test('normalizes movie search artwork and identifying metadata', async () => {
  const urls: string[] = []
  const client = new YTSMovieClient({ fetchImpl: async (input) => {
    urls.push(String(input))
    return response({ data: { movies: [{ id: 7, title_english: 'Example Movie', year: 2024, rating: 7.2, genres: ['Drama'], language: 'en', imdb_code: 'tt1234567', medium_cover_image: 'http://images.example/poster.jpg' }] } })
  } })
  const movies = await client.searchMovies('Example Movie')
  assert.equal(urls[0], 'https://yts.bz/api/v2/list_movies.json?limit=20&query_term=Example%20Movie')
  assert.deepEqual(movies, [{ id: 7, title: 'Example Movie', year: 2024, posterUrl: 'https://images.example/poster.jpg', rating: 7.2, genres: ['Drama'], language: 'en', imdbId: 'tt1234567' }])
})

test('loads movie details and coalesces cached requests', async () => {
  let calls = 0
  const client = new YTSMovieClient({ fetchImpl: async () => {
    calls += 1
    return response({ data: { movie: { id: 7, title: 'Example', year: 2024, description_full: 'Overview', runtime: 120, large_cover_image: 'https://images.example/poster.jpg', background_image_original: 'https://images.example/backdrop.jpg', mpa_rating: 'PG-13' } } })
  } })
  const [first, second] = await Promise.all([client.getMovie(7), client.getMovie(7)])
  const third = await client.getMovie(7)
  assert.equal(calls, 1)
  assert.deepEqual(first, second)
  assert.deepEqual(second, third)
  assert.equal(first.summary, 'Overview')
  assert.equal(first.runtimeMinutes, 120)
})

test('returns an empty movie list when the catalog has no matches', async () => {
  const client = new YTSMovieClient({ fetchImpl: async () => response({ data: { movie_count: 0 } }) })
  assert.deepEqual(await client.searchMovies('No Such Movie'), [])
})
