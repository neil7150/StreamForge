import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlaybackSettings } from '../../../packages/core/src/stores/playbackSettingsStore.ts'

test('malformed saved settings recover safely without accepting invalid enum and numeric values', () => {
  const settings = normalizePlaybackSettings({ preferredQuality: 'garbage', subtitleMode: 'garbage', minimumSeeders: 'five', smartDownloadCount: 99, stremioAddonUrls: [null, 42, 'https://example.com'], torznabEndpoints: [null, { url: 'https://example.com', apiKey: 42 }] })
  assert.equal(settings.preferredQuality, 'auto')
  assert.equal(settings.subtitleMode, 'auto')
  assert.equal(settings.minimumSeeders, 1)
  assert.equal(settings.smartDownloadCount, 5)
  assert.deepEqual(settings.stremioAddonUrls, ['https://example.com'])
  assert.equal(settings.torznabEndpoints[0].apiKey, '')
  assert.equal(normalizePlaybackSettings(null).preferredQuality, 'auto')
})
