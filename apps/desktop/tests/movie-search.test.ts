import assert from 'node:assert/strict'
import test from 'node:test'
import type { TorrentProviderName, TorrentSearchResult } from '../src/main/search/provider-policy.ts'
import { buildMovieSearchQuery, matchesMovieRelease } from '../src/main/search/movie-search-policy.ts'

function result(name: string, provider: TorrentProviderName = 'APIBay', added = ''): TorrentSearchResult {
  return { id: name, name, provider, added, magnetURI: '', seeders: 1, leechers: 0, size: '1 GB', sizeBytes: 1, category: 'Movies' }
}

test('builds movie searches using title and release year', () => {
  assert.equal(buildMovieSearchQuery({ title: 'Arrival', year: 2016 }), 'Arrival 2016')
  assert.equal(buildMovieSearchQuery({ title: 'Arrival' }), 'Arrival')
})

test('matches exact movie title and year across providers', () => {
  const request = { title: 'The Arrival', year: 1996 }
  assert.equal(matchesMovieRelease(result('The.Arrival.1996.1080p.BluRay'), request), true)
  assert.equal(matchesMovieRelease(result('The Arrival [1080p]', 'YTS', '1996'), request), true)
  assert.equal(matchesMovieRelease(result('The.Arrival.2016.1080p'), request), false)
  assert.equal(matchesMovieRelease(result('Arrival.1996.1080p'), request), false)
  assert.equal(matchesMovieRelease(result('The Arrival', 'InternetArchive', '1996'), request), true)
})

test('rejects television episodes from movie results', () => {
  const request = { title: 'Example', year: 2020 }
  assert.equal(matchesMovieRelease(result('Example.2020.S01E02.1080p'), request), false)
  assert.equal(matchesMovieRelease(result('Example.2020.1x02.720p'), request), false)
  assert.equal(matchesMovieRelease(result('Example 2020 Official Trailer 1080p'), request), false)
})

test('normalizes punctuation and protects short titles', () => {
  assert.equal(matchesMovieRelease(result('WallE.2008.1080p'), { title: 'WALL-E', year: 2008 }), true)
  assert.equal(matchesMovieRelease(result('It.2017.1080p'), { title: 'It', year: 2017 }), true)
  assert.equal(matchesMovieRelease(result('Little.Women.2019.1080p'), { title: 'It', year: 2019 }), false)
})
