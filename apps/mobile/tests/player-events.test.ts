import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptsPlayerStatus } from '../src/playback/player-event-policy.ts'

test('a stale player error cannot terminate a newly resolving/loading source', () => {
  assert.equal(acceptsPlayerStatus(false, 'error', 'error'), false)
  assert.equal(acceptsPlayerStatus(true, 'error', 'loading'), false)
  assert.equal(acceptsPlayerStatus(true, 'error', 'readyToPlay'), false)
  assert.equal(acceptsPlayerStatus(true, 'error', 'error'), true)
})
