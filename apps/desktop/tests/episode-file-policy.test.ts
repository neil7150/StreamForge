import assert from 'node:assert/strict'
import test from 'node:test'
import { findPreferredEpisodeFile } from '../src/main/torrent/episode-file-policy.ts'

const preferred = { seasonNumber: 1, episodeNumber: 2 }

test('selects the one video file matching the requested episode', () => {
  const result = findPreferredEpisodeFile([
    { name: 'Example.Show.S01E01.mkv' },
    { name: 'Example.Show.S01E02.mkv' },
    { name: 'Example.Show.S01E03.mkv' }
  ], preferred)
  assert.deepEqual(result, { status: 'matched', fileIndex: 1, candidateIndexes: [1] })
})

test('supports alternate episode notation and paths inside season packs', () => {
  const result = findPreferredEpisodeFile([
    { name: 'Example Show 1x01.mp4', path: 'Example Show/Season 1/Example Show 1x01.mp4' },
    { name: 'Example Show 1x02.mp4', path: 'Example Show/Season 1/Example Show 1x02.mp4' }
  ], preferred)
  assert.equal(result.status, 'matched')
  assert.equal(result.fileIndex, 1)
})

test('does not confuse adjacent episodes or non-video extras', () => {
  const result = findPreferredEpisodeFile([
    { name: 'Example.Show.S01E01.mkv' },
    { name: 'Example.Show.S01E02.srt' },
    { name: 'Example.Show.S01E20.mkv' }
  ], preferred)
  assert.deepEqual(result, { status: 'not-found', fileIndex: null, candidateIndexes: [] })
})

test('requires a manual choice when multiple video files match', () => {
  const result = findPreferredEpisodeFile([
    { name: 'Example.Show.S01E02.1080p.mkv' },
    { name: 'Example.Show.S01E02.720p.mp4' }
  ], preferred)
  assert.deepEqual(result, { status: 'ambiguous', fileIndex: null, candidateIndexes: [0, 1] })
})

test('selects an absolute-numbered anime episode file using a verified alias', () => {
  const result = findPreferredEpisodeFile([
    { name: '[Group] Naruto Shippuuden - 219.mkv' },
    { name: '[Group] Naruto Shippuuden - 220v2.mkv' },
    { name: '[Group] Naruto Shippuuden - 221.mkv' }
  ], {
    seasonNumber: 10,
    episodeNumber: 24,
    absoluteEpisodeNumber: 220,
    seriesTitles: ['Naruto: Shippuden', 'Naruto Shippuuden']
  })
  assert.deepEqual(result, { status: 'matched', fileIndex: 1, candidateIndexes: [1] })
})

test('absolute-only anime selection ignores fake seasonal files', () => {
  const result = findPreferredEpisodeFile([
    { name: 'Bleach S02E01.mkv' },
    { name: '[Group] Bleach - 014.mkv' }
  ], {
    seasonNumber: 2,
    episodeNumber: 1,
    absoluteEpisodeNumber: 14,
    absoluteEpisodeOnly: true,
    seriesTitles: ['Bleach']
  })
  assert.deepEqual(result, { status: 'matched', fileIndex: 1, candidateIndexes: [1] })
})

test('extracts a bare absolute-numbered file from a full-series anime torrent', () => {
  const result = findPreferredEpisodeFile([
    { name: '[Group] 013 - The Blade.mkv', path: 'Bleach Complete/[Group] 013 - The Blade.mkv' },
    { name: '[Group] 014 - Back to Back.mkv', path: 'Bleach Complete/[Group] 014 - Back to Back.mkv' },
    { name: '[Group] 015 - Kon\'s Great Plan.mkv', path: 'Bleach Complete/[Group] 015 - Kon\'s Great Plan.mkv' }
  ], {
    seasonNumber: 2,
    episodeNumber: 1,
    absoluteEpisodeNumber: 14,
    absoluteEpisodeOnly: true,
    seriesTitles: ['Bleach']
  })
  assert.deepEqual(result, { status: 'matched', fileIndex: 1, candidateIndexes: [1] })
})

test('does not mistake one combined multi-episode video for an extracted episode', () => {
  const result = findPreferredEpisodeFile([
    { name: 'Bleach - 014-015.mkv' }
  ], {
    seasonNumber: 2,
    episodeNumber: 1,
    absoluteEpisodeNumber: 14,
    absoluteEpisodeOnly: true,
    seriesTitles: ['Bleach']
  })
  assert.deepEqual(result, { status: 'not-found', fileIndex: null, candidateIndexes: [] })
})

test('uses a provider-supplied exact file index for a series pack', () => {
  const files = [
    { name: 'Series Pack.txt' },
    { name: 'opaque-release-name-a.mkv' },
    { name: 'opaque-release-name-b.mkv' }
  ]
  assert.deepEqual(findPreferredEpisodeFile(files, {
    seasonNumber: 1,
    episodeNumber: 2,
    fileIndex: 2
  }), { status: 'matched', fileIndex: 2, candidateIndexes: [2] })
  assert.equal(findPreferredEpisodeFile(files, {
    seasonNumber: 1,
    episodeNumber: 2,
    fileIndex: 0
  }).status, 'not-found')
})
