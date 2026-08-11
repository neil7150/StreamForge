import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildEpisodeSearchQuery,
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
