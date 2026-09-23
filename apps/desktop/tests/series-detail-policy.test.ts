import assert from 'node:assert/strict'
import test from 'node:test'
import type { EpisodeSummary, SeasonSummary } from '../src/preload/index.d.ts'
import {
  absoluteEpisodeNumber,
  episodeCode,
  formatCatalogDate,
  isUpcomingEpisode,
  parseSeriesId,
  seasonLabel,
  usesAbsoluteEpisodeNumbering
} from '../src/renderer/src/lib/series-detail-policy.ts'

function season(overrides: Partial<SeasonSummary> = {}): SeasonSummary {
  return {
    id: 10,
    seriesId: 1,
    number: 1,
    name: null,
    episodeCount: 8,
    premiereDate: null,
    endDate: null,
    network: null,
    posterUrl: null,
    summary: null,
    ...overrides
  }
}

function episode(overrides: Partial<EpisodeSummary> = {}): EpisodeSummary {
  return {
    id: 20,
    seasonId: 10,
    seasonNumber: 1,
    episodeNumber: 2,
    title: 'Example',
    type: 'regular',
    airDate: null,
    airStamp: null,
    runtimeMinutes: 45,
    stillUrl: null,
    summary: null,
    tvmazeUrl: null,
    ...overrides
  }
}

test('accepts only bounded positive integer series route IDs', () => {
  assert.equal(parseSeriesId('42'), 42)
  assert.equal(parseSeriesId('0'), null)
  assert.equal(parseSeriesId('-1'), null)
  assert.equal(parseSeriesId('1.5'), null)
  assert.equal(parseSeriesId('series'), null)
  assert.equal(parseSeriesId(undefined), null)
})

test('labels regular seasons, named seasons, and specials', () => {
  assert.equal(seasonLabel(season()), 'Season 1')
  assert.equal(seasonLabel(season({ number: 2, name: 'The Return' })), 'The Return')
  assert.equal(seasonLabel(season({ number: 0 })), 'Specials')
})

test('builds stable episode codes including unnumbered specials', () => {
  assert.equal(episodeCode(episode()), 'S01E02')
  assert.equal(episodeCode(episode({ seasonNumber: 12, episodeNumber: 3 })), 'S12E03')
  assert.equal(episodeCode(episode({ seasonNumber: 0, episodeNumber: null })), 'Special')
})

test('classifies future episodes against an explicit clock', () => {
  const now = Date.parse('2026-08-10T12:00:00Z')
  assert.equal(isUpcomingEpisode(episode({ airDate: '2026-08-11' }), now), true)
  assert.equal(isUpcomingEpisode(episode({ airDate: '2026-08-09' }), now), false)
  assert.equal(isUpcomingEpisode(episode({ airDate: null }), now), false)
})

test('formats ISO catalog dates without local timezone drift', () => {
  assert.equal(formatCatalogDate('2026-08-10'), 'Aug 10, 2026')
  assert.equal(formatCatalogDate(null), null)
  assert.equal(formatCatalogDate('unknown'), 'unknown')
})

test('calculates absolute anime episode numbers from preceding regular seasons', () => {
  const seasons = [
    season({ number: 0, episodeCount: 4 }),
    season({ number: 1, episodeCount: 25 }),
    season({ number: 2, episodeCount: 24 }),
    season({ number: 3, episodeCount: 26 })
  ]
  assert.equal(absoluteEpisodeNumber(seasons, 1, 1), 1)
  assert.equal(absoluteEpisodeNumber(seasons, 3, 2), 51)
  assert.equal(absoluteEpisodeNumber(seasons, 0, 2), undefined)
  assert.equal(absoluteEpisodeNumber([season({ number: 1, episodeCount: null }), season({ number: 2 })], 2, 1), undefined)
})

test('presents year-grouped long-running anime as absolute episode ranges', () => {
  const seasons = [
    season({ number: 1, episodeCount: 13, absoluteEpisodeStart: 1, absoluteEpisodeEnd: 13 }),
    season({ number: 2, episodeCount: 49, absoluteEpisodeStart: 14, absoluteEpisodeEnd: 62 })
  ]
  assert.equal(usesAbsoluteEpisodeNumbering(seasons), true)
  assert.equal(seasonLabel(seasons[1]), 'Episodes 14–62')
  assert.equal(absoluteEpisodeNumber(seasons, 2, 1), 14)
  assert.equal(episodeCode(episode({ seasonNumber: 2, episodeNumber: 1 }), 14), 'EP 014')
  assert.equal(seasonLabel(season({ absoluteEpisodeStart: 1156, absoluteEpisodeEnd: undefined })), 'Episodes 1156+')
})
