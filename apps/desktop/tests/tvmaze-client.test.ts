import assert from 'node:assert/strict'
import test from 'node:test'
import { TVMazeClient, stripTVMazeHTML } from '../src/main/metadata/tvmaze-client.ts'

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })
}

test('normalizes series search results into safe application metadata', async () => {
  const requests: string[] = []
  const client = new TVMazeClient({
    fetchImpl: async (input) => {
      requests.push(String(input))
      return jsonResponse([{
        score: 0.9,
        show: {
          id: 42,
          name: 'Example Show',
          url: 'http://www.tvmaze.com/shows/42/example-show',
          type: 'Scripted',
          language: 'English',
          genres: ['Drama', 'Mystery'],
          status: 'Ended',
          premiered: '2019-04-02',
          averageRuntime: 52,
          network: { name: 'Example Network' },
          rating: { average: 8.4 },
          image: {
            medium: 'http://static.tvmaze.com/uploads/images/medium_portrait/example.jpg',
            original: 'https://static.tvmaze.com/uploads/images/original/example.jpg'
          },
          summary: '<p>A mystery &amp; a <b>friendship</b>.</p>',
          externals: { imdb: 'tt1234567' }
        }
      }])
    }
  })

  const results = await client.searchSeries('Example Show')

  assert.equal(requests[0], 'https://api.tvmaze.com/search/shows?q=Example%20Show')
  assert.deepEqual(results, [{
    id: 42,
    title: 'Example Show',
    posterUrl: 'https://static.tvmaze.com/uploads/images/medium_portrait/example.jpg',
    year: 2019,
    status: 'Ended',
    network: 'Example Network',
    type: 'Scripted',
    language: 'English',
    genres: ['Drama', 'Mystery'],
    rating: 8.4,
    summary: 'A mystery & a friendship.',
    tvmazeUrl: 'https://www.tvmaze.com/shows/42/example-show',
    imdbId: 'tt1234567'
  }])
})

test('normalizes and sorts seasons and episodes while preserving specials', async () => {
  const client = new TVMazeClient({
    fetchImpl: async (input) => {
      const url = String(input)
      if (url.endsWith('/shows/42/seasons')) {
        return jsonResponse([
          { id: 102, number: 2, episodeOrder: 8, name: 'Second', image: null },
          { id: 100, number: 0, episodeOrder: 1, name: 'Specials', image: null },
          { id: 'bad', number: 1 }
        ])
      }
      return jsonResponse([
        { id: 3, season: 0, number: null, name: 'Behind the Scenes', image: null },
        { id: 2, season: 0, number: 2, name: 'Holiday Special', runtime: 44, image: null },
        { id: 1, season: 0, number: 1, name: 'Pilot Special', runtime: 40, image: null }
      ])
    }
  })

  const seasons = await client.getSeasons(42)
  const episodes = await client.getSeasonEpisodes(100)

  assert.deepEqual(seasons.map((season) => season.number), [0, 2])
  assert.ok(seasons.every((season) => season.seriesId === 42))
  assert.deepEqual(episodes.map((episode) => episode.episodeNumber), [1, 2, null])
  assert.ok(episodes.every((episode) => episode.seasonNumber === 0 && episode.seasonId === 100))
})

test('converts year-numbered anime groups into usable season and absolute episode numbering', async () => {
  const client = new TVMazeClient({
    fetchImpl: async (input) => {
      const url = String(input)
      if (url.endsWith('/shows/1905/seasons')) {
        return jsonResponse([
          { id: 6969, number: 2004, episodeOrder: null, name: '#1 - #13', image: null },
          { id: 176461, number: 2005, episodeOrder: null, name: '#14 - #62', image: null },
          { id: 195570, number: 2026, episodeOrder: null, name: '#1156 -', image: null }
        ])
      }
      return jsonResponse([
        { id: 158370, season: 2005, number: 1, name: 'Back to Back, a Fight to the Death!', image: null }
      ])
    }
  })

  const seasons = await client.getSeasons(1905)
  const episodes = await client.getSeasonEpisodes(176461)

  assert.deepEqual(seasons.map((season) => season.number), [1, 2, 3])
  assert.deepEqual(seasons.map((season) => season.episodeCount), [13, 49, null])
  assert.deepEqual(seasons.map((season) => [season.absoluteEpisodeStart, season.absoluteEpisodeEnd]), [[1, 13], [14, 62], [1156, undefined]])
  assert.equal(episodes[0]?.seasonNumber, 2)
  assert.equal(episodes[0]?.episodeNumber, 1)
})

test('coalesces concurrent requests and serves later requests from cache', async () => {
  let calls = 0
  const client = new TVMazeClient({
    fetchImpl: async () => {
      calls += 1
      return jsonResponse([{ show: { id: 1, name: 'Cached Show', image: null } }])
    }
  })

  const [first, second] = await Promise.all([
    client.searchSeries('cached'),
    client.searchSeries('cached')
  ])
  const third = await client.searchSeries(' CACHED ')

  assert.equal(calls, 1)
  assert.deepEqual(first, second)
  assert.deepEqual(second, third)
})

test('retries one rate-limited request using Retry-After', async () => {
  let calls = 0
  const waits: number[] = []
  const client = new TVMazeClient({
    fetchImpl: async () => {
      calls += 1
      return calls === 1
        ? jsonResponse({ error: 'rate limited' }, 429, { 'retry-after': '2' })
        : jsonResponse({ id: 7, name: 'Recovered', image: null })
    },
    sleep: async (milliseconds) => { waits.push(milliseconds) }
  })

  const series = await client.getSeries(7)

  assert.equal(calls, 2)
  assert.deepEqual(waits, [2_000])
  assert.equal(series.title, 'Recovered')
})

test('strips markup without interpreting metadata as executable HTML', () => {
  assert.equal(
    stripTVMazeHTML('<p>Hello<br>world &quot;today&quot; <script>alert(1)</script></p>'),
    'Hello world "today" alert(1)'
  )
  assert.equal(stripTVMazeHTML(null), null)
})
