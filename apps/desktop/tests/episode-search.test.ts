import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildEpisodeSearchQuery,
  buildAnimeAbsoluteSearchQueries,
  buildAnimeBatchSearchQueries,
  matchesEpisodeRelease,
  type EpisodeTorrentSearchRequest
} from '../src/main/search/episode-search-policy.ts'

const request: EpisodeTorrentSearchRequest = {
  seriesTitle: 'Example Show',
  seasonNumber: 1,
  episodeNumber: 2,
  episodeTitle: 'Arrival'
}

test('builds a canonical zero-padded episode provider query', () => {
  assert.equal(buildEpisodeSearchQuery(request), 'Example Show S01E02')
  assert.equal(buildEpisodeSearchQuery({ ...request, seasonNumber: 12, episodeNumber: 104 }), 'Example Show S12E104')
})

test('matches common exact episode release notation', () => {
  assert.equal(matchesEpisodeRelease('Example.Show.S01E02.1080p.WEB-DL.x264.AAC', request), true)
  assert.equal(matchesEpisodeRelease('Example Show 1x02 720p HDTV', request), true)
  assert.equal(matchesEpisodeRelease('ExampleShow.S01.E02.HEVC', request), true)
})

test('rejects multi-episode releases and episode ranges', () => {
  assert.equal(matchesEpisodeRelease('Example.Show.S01E01E02.1080p', request), false)
  assert.equal(matchesEpisodeRelease('Example.Show.S01E02E03.1080p', request), false)
  assert.equal(matchesEpisodeRelease('Example.Show.S01E02-E04.1080p', request), false)
  assert.equal(matchesEpisodeRelease('Example.Show.S01E02.Episodes.02-10.1080p', request), false)
})

test('rejects adjacent episodes, other series, and season packs', () => {
  assert.equal(matchesEpisodeRelease('Example.Show.S01E01.1080p', request), false)
  assert.equal(matchesEpisodeRelease('Example.Show.S02E02.1080p', request), false)
  assert.equal(matchesEpisodeRelease('Different.Show.S01E02.1080p', request), false)
  assert.equal(matchesEpisodeRelease('Example.Show.S01.Complete.1080p', request), false)
  assert.equal(matchesEpisodeRelease('Example.Show.S01E02.Season.Pack.1080p', request), false)
  assert.equal(matchesEpisodeRelease('Example.Show.S01E02.Batch.1080p', request), false)
})

test('normalizes punctuation in series titles without confusing short titles', () => {
  const shield = { ...request, seriesTitle: "Marvel's Agents of S.H.I.E.L.D." }
  assert.equal(matchesEpisodeRelease('Marvels.Agents.of.SHIELD.S01E02.1080p', shield), true)

  const it = { ...request, seriesTitle: 'It' }
  assert.equal(matchesEpisodeRelease('It.S01E02.720p', it), true)
  assert.equal(matchesEpisodeRelease('Little.Fires.S01E02.720p', it), false)
})

test('requires the complete show title immediately before the episode token', () => {
  const dark = { ...request, seriesTitle: 'Dark' }
  assert.equal(matchesEpisodeRelease('Dark.S01E02.1080p', dark), true)
  assert.equal(matchesEpisodeRelease('Dark.Matter.S01E02.1080p', dark), false)
  assert.equal(matchesEpisodeRelease('The.Dark.S01E02.1080p', dark), false)
  assert.equal(matchesEpisodeRelease('[Group] Dark.2017.S01E02.1080p', dark), true)
  assert.equal(matchesEpisodeRelease('www.example.com-Dark.S01E02.1080p', dark), true)
})

test('builds bounded absolute-number searches from unique anime aliases', () => {
  const anime = {
    ...request,
    seriesTitle: 'Naruto: Shippuden',
    seriesAliases: ['Naruto Shippuden', 'Naruto: Shippuuden', 'Naruto Shippuden'],
    absoluteEpisodeNumber: 220
  }
  assert.deepEqual(buildAnimeAbsoluteSearchQueries(anime), [
    'Naruto: Shippuden 220',
    'Naruto: Shippuuden 220'
  ])
})

test('matches exact absolute anime episodes and extractable multi-file ranges', () => {
  const anime = {
    ...request,
    seriesTitle: 'Naruto: Shippuden',
    seriesAliases: ['Naruto Shippuden', 'Naruto Shippuuden'],
    absoluteEpisodeNumber: 220
  }
  assert.equal(matchesEpisodeRelease('[Group] Naruto Shippuuden - 220v2 [1080p].mkv', anime), true)
  assert.equal(matchesEpisodeRelease('Naruto Shippuden 219 1080p', anime), false)
  assert.equal(matchesEpisodeRelease('Boruto Naruto Next Generations 220 1080p', anime), false)
  assert.equal(matchesEpisodeRelease('Naruto Shippuden 220-221 1080p', anime), true)
})

test('absolute-only anime searches reject fake seasonal numbering', () => {
  const absoluteRequest = {
    ...request,
    seriesTitle: 'Bleach',
    seriesAliases: ['Bleach'],
    seasonNumber: 2,
    episodeNumber: 1,
    absoluteEpisodeNumber: 14,
    absoluteEpisodeOnly: true
  }
  assert.equal(matchesEpisodeRelease('[Group] Bleach - 014 [1080p].mkv', absoluteRequest), true)
  assert.equal(matchesEpisodeRelease('Bleach S02E01 1080p WEB-DL.mkv', absoluteRequest), false)
})

test('searches verified anime batches and accepts only packs containing the episode', () => {
  const batchRequest = {
    ...request,
    seriesTitle: 'Bleach',
    seriesAliases: ['BLEACH', 'Bleach'],
    seasonNumber: 2,
    episodeNumber: 1,
    absoluteEpisodeNumber: 14,
    absoluteEpisodeOnly: true
  }
  assert.deepEqual(buildAnimeBatchSearchQueries(batchRequest), ['Bleach batch', 'Bleach complete'])
  assert.equal(matchesEpisodeRelease('[Group] Bleach 001-366 Complete Series 1080p', batchRequest), true)
  assert.equal(matchesEpisodeRelease('Bleach 1-366 + Movies Batch Complete', batchRequest), true)
  assert.equal(matchesEpisodeRelease('Bleach Anime episodes 001 to 100 BATCH', batchRequest), true)
  assert.equal(matchesEpisodeRelease('(AnimeOut) Bleach (Complete Batch+Extras) 480p', batchRequest), true)
  assert.equal(matchesEpisodeRelease('Bleach Complete Series [Dual Audio]', batchRequest), true)
  assert.equal(matchesEpisodeRelease('Bleach 015-366 Batch', batchRequest), false)
  assert.equal(matchesEpisodeRelease('Bleach Thousand-Year Blood War 001-013 Batch', batchRequest), false)
  assert.equal(matchesEpisodeRelease('Bleach Thousand-Year Blood War 001-026 Batch', batchRequest), false)
  assert.equal(matchesEpisodeRelease('Bleach Sennen Kessen Hen 01-14 Batch', batchRequest), false)
  assert.equal(matchesEpisodeRelease('Bleach (2004) Complete 001-366 Batch', batchRequest), true)
  assert.equal(matchesEpisodeRelease('Different Show 001-366 Batch', batchRequest), false)
  assert.equal(matchesEpisodeRelease('Bleach Complete Collection 1-164 + Movie', {
    ...batchRequest, absoluteEpisodeNumber: 220
  }), false)
  assert.equal(matchesEpisodeRelease('Bleach Complete Seasons 1-16 (EP 001-366)', {
    ...batchRequest, absoluteEpisodeNumber: 220
  }), true)
})
