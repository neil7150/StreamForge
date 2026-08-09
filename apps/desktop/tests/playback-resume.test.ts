import assert from 'node:assert/strict'
import test from 'node:test'
import { formatResumeTime, getPlaybackResumeTime } from '../src/renderer/src/lib/playback-resume.ts'

test('prefers an exact saved playback time over percentage progress', () => {
  assert.equal(getPlaybackResumeTime({ currentTime: 725, progress: 0.2 }, 3_600), 725)
})

test('falls back to progress for history created before exact time was stored', () => {
  assert.equal(getPlaybackResumeTime({ progress: 0.25 }, 4_000), 1_000)
})

test('starts over near the beginning or end of a video', () => {
  assert.equal(getPlaybackResumeTime({ currentTime: 5, progress: 0.01 }, 1_000), 0)
  assert.equal(getPlaybackResumeTime({ currentTime: 970, progress: 0.97 }, 1_000), 0)
})

test('formats resume timestamps for short and long videos', () => {
  assert.equal(formatResumeTime(125), '2:05')
  assert.equal(formatResumeTime(3_725), '1:02:05')
})
