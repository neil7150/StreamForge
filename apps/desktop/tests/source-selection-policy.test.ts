import test from 'node:test'
import assert from 'node:assert/strict'
import type { TorrentSearchResult } from '../src/preload/index.ts'
import { rankSources, sortSourcesBySeeders } from '../src/renderer/src/lib/source-selection-policy.ts'

const settings = {
  preferredQuality: 'auto' as const,
  preferDirectPlay: true,
  minimumSeeders: 1,
  maxStreamSizeGb: 0,
  preferredAudioLanguage: '',
  preferredSubtitleLanguage: 'eng',
  subtitleMode: 'auto' as const,
  autoplayNextEpisode: true,
  automaticSourceFallback: true,
  smartDownloads: false,
  smartDownloadCount: 1,
  skipChapterMarkers: true,
  openSubtitlesApiKey: ''
}

function source(id: string, name: string, seeders: number, sizeBytes = 2 * 1024 ** 3): TorrentSearchResult {
  return { id, name, magnetURI: `magnet:?xt=urn:btih:${id.padEnd(40, '0')}`, seeders, leechers: 0, size: `${(sizeBytes / 1024 ** 3).toFixed(1)} GB`, sizeBytes, category: 'video', added: '', provider: 'APIBay' }
}

test('source lists remain strictly ordered by seed count', () => {
  const results = sortSourcesBySeeders([source('a', '1080p x264 AAC', 25), source('b', '720p', 250), source('c', '2160p HEVC', 80)])
  assert.deepEqual(results.map((item) => item.seeders), [250, 80, 25])
})

test('Play Best balances health with quality and direct-play preferences', () => {
  const results = rankSources([source('a', 'Release 720p HEVC DTS', 100), source('b', 'Release 1080p x264 AAC', 80)], { ...settings, preferredQuality: '1080p' })
  assert.equal(results[0].id, 'b')
})

test('sources below the minimum seed threshold rank after healthy sources', () => {
  const results = rankSources([source('a', 'Release 1080p x264 AAC', 2), source('b', 'Release 720p HEVC', 20)], { ...settings, minimumSeeders: 5 })
  assert.equal(results[0].id, 'b')
})
