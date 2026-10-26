import test from 'node:test'
import assert from 'node:assert/strict'
import { bundledSubtitles, matchesLanguage, seekTarget } from '../src/playback/control-policy.ts'
import { normalizePlaybackSettings } from '../../../packages/core/src/stores/playbackSettingsStore.ts'
import { parseSubtitles, findActiveSubtitleCue } from '../../../packages/core/src/policies/subtitle-policy.ts'

test('seeking clamps edges and rejects unknown duration or malformed layout', () => {
  assert.equal(seekTarget(50, 100, 7200), 3600)
  assert.equal(seekTarget(-10, 100, 7200), 0)
  assert.equal(seekTarget(110, 100, 7200), 7200)
  for (const args of [[0, 0, 10], [1, 10, 0], [NaN, 10, 10], [1, Infinity, 10]]) assert.equal(seekTarget(...args as [number, number, number]), null)
})

test('subtitle language preference matches player language codes', () => {
  assert.equal(matchesLanguage('en-US', 'eng'), true)
  assert.equal(matchesLanguage('ja', 'jpn'), true)
  assert.equal(matchesLanguage('hi-IN', 'hin'), true)
  assert.equal(matchesLanguage('es', 'eng'), false)
  assert.equal(matchesLanguage(undefined, 'eng'), false)
})

test('bundled captions prioritize the video and exclude other episodes or oversized files', () => {
  const file = (index: number, path: string, size = 100) => ({ index, path, name: path, size, type: 'other' })
  const files = [file(0, 'Show.S01E02.mkv'), file(1, 'Show.S01E03.eng.srt'), file(2, 'Other.srt'), file(3, 'Show.S01E02.eng.srt'), file(4, 'Show.S01E02.vtt'), file(5, 'Show.S01E02.ass'), file(6, 'large.srt', 2097153), file(7, 'empty.vtt', 0)]
  assert.deepEqual(bundledSubtitles(files, 0).map(file => file.index), [3, 4, 2])
})

test('fit preferences accept supported modes and safely migrate older settings', () => {
  assert.equal(normalizePlaybackSettings({}).videoFit, 'contain')
  assert.equal(normalizePlaybackSettings({ videoFit: 'cover' }).videoFit, 'cover')
  assert.equal(normalizePlaybackSettings({ videoFit: 'fill' }).videoFit, 'fill')
  assert.equal(normalizePlaybackSettings({ videoFit: 'unknown' }).videoFit, 'contain')
})

test('subtitle delay stays synchronized after jumping to another point in the video', () => {
  const cues = parseSubtitles('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nFirst\n\n00:50:00.000 --> 00:50:02.000\nLater')
  assert.equal(findActiveSubtitleCue(cues, 3001.5, 0.5)?.text, 'Later')
  assert.equal(findActiveSubtitleCue(cues, 2, 0)?.text, 'First')
  assert.equal(findActiveSubtitleCue(cues, 10, 0), null)
})
