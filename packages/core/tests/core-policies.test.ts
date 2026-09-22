import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatBytes,
  formatDuration,
  formatSpeed,
  formatTimeRemaining,
  extractInfoHash,
  isValidMagnet,
  getVideoMimeType
} from '../src/utils/utils.ts'
import {
  requireInfoHash,
  requireMagnetURI,
  requireFileIndex,
  requireSearchQuery
} from '../src/types/validation.ts'
import {
  getPlaybackResumeTime,
  formatResumeTime
} from '../src/policies/playback-resume.ts'
import {
  rankSources,
  sortSourcesBySeeders
} from '../src/policies/source-selection-policy.ts'
import { parseSubtitles } from '../src/policies/subtitle-policy.ts'

test('utils: formatBytes and formatSpeed', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(1024), '1.0 KB')
  assert.equal(formatBytes(1048576), '1.0 MB')
  assert.equal(formatSpeed(2048), '2.0 KB/s')
})

test('utils: formatDuration', () => {
  assert.equal(formatDuration(0), '0s')
  assert.equal(formatDuration(65), '1m 5s')
  assert.equal(formatDuration(3665), '1h 1m')
})

test('utils: magnet parsing and validation', () => {
  const hash = '0123456789abcdef0123456789abcdef01234567'
  const magnet = `magnet:?xt=urn:btih:${hash}&dn=Test`
  assert.equal(isValidMagnet(magnet), true)
  assert.equal(extractInfoHash(magnet), hash)
  assert.equal(requireInfoHash(hash), hash)
  assert.equal(requireMagnetURI(magnet), magnet)
})

test('utils: video MIME types', () => {
  assert.equal(getVideoMimeType('movie.mp4'), 'video/mp4')
  assert.equal(getVideoMimeType('movie.mkv'), 'video/x-matroska')
  assert.equal(getVideoMimeType('movie.webm'), 'video/webm')
})

test('policies: playback resume calculations', () => {
  // Near start (<10s) -> should return 0
  assert.equal(getPlaybackResumeTime({ currentTime: 5 }, 1000), 0)
  // Normal progress -> should return currentTime
  assert.equal(getPlaybackResumeTime({ currentTime: 120 }, 1000), 120)
  // Near end (>95%) -> should return 0
  assert.equal(getPlaybackResumeTime({ currentTime: 960 }, 1000), 0)
  assert.equal(formatResumeTime(125), '2:05')
})

test('policies: source selection scoring', () => {
  const sources = [
    {
      id: '1',
      name: 'Movie 2024 1080p BluRay x264',
      magnetURI: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
      seeders: 50,
      leechers: 10,
      size: '2.0 GB',
      sizeBytes: 2147483648,
      category: 'Movies',
      added: '2024-01-01',
      provider: 'YTS' as const
    },
    {
      id: '2',
      name: 'Movie 2024 720p WEB',
      magnetURI: 'magnet:?xt=urn:btih:1123456789abcdef0123456789abcdef01234567',
      seeders: 10,
      leechers: 2,
      size: '1.0 GB',
      sizeBytes: 1073741824,
      category: 'Movies',
      added: '2024-01-01',
      provider: 'YTS' as const
    }
  ]
  const ranked = rankSources(sources, { preferredQuality: '1080p', preferDirectPlay: true, minimumSeeders: 1, maxStreamSizeGb: 0 } as any)
  assert.equal(ranked[0]?.id, '1')
})

test('policies: subtitle parser', () => {
  const srt = `1
00:00:01,000 --> 00:00:04,000
Hello World!

2
00:00:05,000 --> 00:00:08,000
Second subtitle line.`

  const parsed = parseSubtitles(srt)
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0].text, 'Hello World!')
  assert.equal(parsed[0].start, 1)
  assert.equal(parsed[0].end, 4)
})
