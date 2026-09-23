import assert from 'node:assert/strict'
import test from 'node:test'
import {
  requireCatalogId,
  requireEpisodeSearchRequest,
  requireFileIndex,
  requireFiniteNumber,
  requireInfoHash,
  requireMagnetURI,
  requireMovieSearchRequest,
  requireMovieCatalogId,
  requirePreferredEpisodeFile,
  requireSearchQuery
} from '../src/main/ipc/validation.ts'

const HASH = '0123456789abcdef0123456789abcdef01234567'

test('accepts and normalizes valid torrent identifiers', () => {
  assert.equal(requireInfoHash(HASH.toUpperCase()), HASH)
  assert.equal(
    requireMagnetURI(`magnet:?xt=urn:btih:${HASH}&dn=Example`),
    `magnet:?xt=urn:btih:${HASH}&dn=Example`
  )
})

test('rejects malformed privileged inputs', () => {
  assert.throws(() => requireInfoHash('../bad'))
  assert.throws(() => requireMagnetURI('https://example.com/file'))
  assert.throws(() => requireFileIndex(-1))
  assert.throws(() => requireFiniteNumber(Number.NaN, 'position', 0, 1))
  assert.throws(() => requireSearchQuery(' '))
})

test('accepts bounded numeric and search inputs', () => {
  assert.equal(requireCatalogId(42, 'series ID'), 42)
  assert.equal(requireFileIndex(4), 4)
  assert.equal(requireFiniteNumber(0.5, 'position', 0, 1), 0.5)
  assert.equal(requireSearchQuery('  public domain movie  '), 'public domain movie')
})

test('rejects malformed catalog identifiers', () => {
  assert.throws(() => requireCatalogId('42'))
  assert.throws(() => requireCatalogId(0))
  assert.throws(() => requireCatalogId(1.5))
})

test('accepts only provider-qualified movie catalog identifiers', () => {
  assert.equal(requireMovieCatalogId('CINEMETA:TT0137523'), 'cinemeta:tt0137523')
  assert.equal(requireMovieCatalogId('YTS:42'), 'yts:42')
  assert.throws(() => requireMovieCatalogId(42))
  assert.throws(() => requireMovieCatalogId('42'))
  assert.throws(() => requireMovieCatalogId('cinemeta:bad'))
})

test('normalizes and bounds structured episode searches', () => {
  assert.deepEqual(requireEpisodeSearchRequest({
    seriesTitle: '  Example Show  ',
    seasonNumber: 1,
    episodeNumber: 2,
    episodeTitle: '  The Arrival  '
  }), {
    seriesTitle: 'Example Show',
    seasonNumber: 1,
    episodeNumber: 2,
    episodeTitle: 'The Arrival'
  })
  assert.throws(() => requireEpisodeSearchRequest(null))
  assert.throws(() => requireEpisodeSearchRequest({ seriesTitle: 'X', seasonNumber: 1, episodeNumber: 2 }))
  assert.throws(() => requireEpisodeSearchRequest({ seriesTitle: 'Show', seasonNumber: -1, episodeNumber: 2 }))
  assert.throws(() => requireEpisodeSearchRequest({ seriesTitle: 'Show', seasonNumber: 1, episodeNumber: 0 }))
  assert.deepEqual(requireEpisodeSearchRequest({
    seriesTitle: 'Naruto Shippuden', seasonNumber: 2, episodeNumber: 4,
    seriesAliases: ['Naruto Shippuuden'], absoluteEpisodeNumber: 30
  }), {
    seriesTitle: 'Naruto Shippuden', seasonNumber: 2, episodeNumber: 4, episodeTitle: undefined,
    seriesAliases: ['Naruto Shippuuden'], absoluteEpisodeNumber: 30
  })
  assert.deepEqual(requireEpisodeSearchRequest({
    seriesTitle: 'Bleach', seasonNumber: 2, episodeNumber: 1,
    absoluteEpisodeNumber: 14, absoluteEpisodeOnly: true
  }), {
    seriesTitle: 'Bleach', seasonNumber: 2, episodeNumber: 1, episodeTitle: undefined,
    absoluteEpisodeNumber: 14, absoluteEpisodeOnly: true
  })
  assert.throws(() => requireEpisodeSearchRequest({
    seriesTitle: 'Bleach', seasonNumber: 2, episodeNumber: 1, absoluteEpisodeOnly: true
  }))
  assert.deepEqual(requireEpisodeSearchRequest({
    seriesTitle: 'Example Show', seasonNumber: 1, episodeNumber: 2,
    imdbId: 'TT1234567', torznabUrl: 'http://localhost:9117/api', torznabApiKey: 'secret'
  }), {
    seriesTitle: 'Example Show', seasonNumber: 1, episodeNumber: 2, episodeTitle: undefined,
    imdbId: 'tt1234567', torznabUrl: 'http://localhost:9117/api', torznabApiKey: 'secret'
  })
  assert.throws(() => requireEpisodeSearchRequest({ seriesTitle: 'Show', seasonNumber: 1, episodeNumber: 2, torznabUrl: 'file:///tmp/feed' }))
  assert.deepEqual(requireEpisodeSearchRequest({
    seriesTitle: 'Example Show', seasonNumber: 1, episodeNumber: 2,
    torznabEndpoints: [
      { url: 'http://localhost:9696/1/api', apiKey: 'prowlarr' },
      { url: 'http://localhost:9117/api/v2.0/indexers/all/results/torznab/api' }
    ]
  }).torznabEndpoints, [
    { url: 'http://localhost:9696/1/api', apiKey: 'prowlarr' },
    { url: 'http://localhost:9117/api/v2.0/indexers/all/results/torznab/api' }
  ])
  assert.throws(() => requireEpisodeSearchRequest({
    seriesTitle: 'Show', seasonNumber: 1, episodeNumber: 2,
    torznabEndpoints: [{ url: 'file:///tmp/feed' }]
  }))
  assert.throws(() => requireEpisodeSearchRequest({
    seriesTitle: 'Show', seasonNumber: 1, episodeNumber: 2,
    torznabEndpoints: Array.from({ length: 9 }, (_, index) => ({ url: `http://localhost:${9000 + index}/api` }))
  }))
  assert.deepEqual(requireEpisodeSearchRequest({
    seriesTitle: 'Show', seasonNumber: 1, episodeNumber: 2,
    stremioAddonUrls: ['https://addon.example/config/manifest.json']
  }).stremioAddonUrls, ['https://addon.example/config/manifest.json'])
  assert.throws(() => requireEpisodeSearchRequest({
    seriesTitle: 'Show', seasonNumber: 1, episodeNumber: 2,
    stremioAddonUrls: ['https://addon.example/config/not-a-manifest']
  }))
})

test('validates preferred episode file selections', () => {
  assert.deepEqual(requirePreferredEpisodeFile({ seasonNumber: 1, episodeNumber: 2 }), {
    seasonNumber: 1,
    episodeNumber: 2
  })
  assert.throws(() => requirePreferredEpisodeFile(null))
  assert.throws(() => requirePreferredEpisodeFile({ seasonNumber: -1, episodeNumber: 2 }))
  assert.throws(() => requirePreferredEpisodeFile({ seasonNumber: 1, episodeNumber: 0 }))
  assert.throws(() => requirePreferredEpisodeFile({ seasonNumber: 2, episodeNumber: 1, absoluteEpisodeOnly: true }))
  assert.equal(requirePreferredEpisodeFile({ seasonNumber: 1, episodeNumber: 2, fileIndex: 14 }).fileIndex, 14)
  assert.throws(() => requirePreferredEpisodeFile({ seasonNumber: 1, episodeNumber: 2, fileIndex: -1 }))
})

test('normalizes and bounds structured movie searches', () => {
  assert.deepEqual(requireMovieSearchRequest({ title: '  Example Movie  ', year: 2024 }), {
    title: 'Example Movie',
    year: 2024
  })
  assert.deepEqual(requireMovieSearchRequest({ title: 'Example Movie' }), { title: 'Example Movie', year: undefined })
  assert.throws(() => requireMovieSearchRequest({ title: 'X', year: 2024 }))
  assert.throws(() => requireMovieSearchRequest({ title: 'Movie', year: 1800 }))
  assert.throws(() => requireMovieSearchRequest({ title: 'Movie', torznabUrl: 'https://user:password@example.com/api' }))
})
