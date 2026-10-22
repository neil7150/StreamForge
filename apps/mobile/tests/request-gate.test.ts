import test from 'node:test'
import assert from 'node:assert/strict'
import { RequestGate } from '../src/data/request-gate.ts'

test('new queries and unmount invalidate earlier results even before the next request', () => {
  const gate = new RequestGate()
  const first = gate.begin()
  gate.cancel()
  assert.equal(first.isCurrent(), false)
  assert.equal(first.signal.aborted, true)
  const second = gate.begin()
  const third = gate.begin()
  assert.equal(second.isCurrent(), false)
  assert.equal(third.isCurrent(), true)
  gate.cancel()
  assert.equal(third.signal.aborted, true)
})
