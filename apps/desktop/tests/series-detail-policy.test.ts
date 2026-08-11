import assert from 'node:assert/strict'
import test from 'node:test'
import type { EpisodeSummary, SeasonSummary } from '../src/preload/index.d.ts'
import {
  episodeCode,
  formatCatalogDate,
  isUpcomingEpisode,
  parseSeriesId,
  seasonLabel
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
