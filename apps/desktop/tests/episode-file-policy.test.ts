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
