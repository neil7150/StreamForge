import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldAutomaticallyFallback } from '../src/renderer/src/lib/automatic-fallback-policy.ts'

test('automatic fallback is allowed only before playback starts', () => {
  const base = { enabled: true, currentSourceIndex: 0, sourceCount: 3, alreadyAttempted: false }
  assert.equal(shouldAutomaticallyFallback({ ...base, playbackStarted: false }), true)
  assert.equal(shouldAutomaticallyFallback({ ...base, playbackStarted: true }), false)
})

test('automatic fallback requires an untried next source', () => {
  assert.equal(shouldAutomaticallyFallback({ enabled: true, playbackStarted: false, currentSourceIndex: 1, sourceCount: 2, alreadyAttempted: false }), false)
  assert.equal(shouldAutomaticallyFallback({ enabled: true, playbackStarted: false, currentSourceIndex: 0, sourceCount: 2, alreadyAttempted: true }), false)
})
