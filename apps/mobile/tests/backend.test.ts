import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveMobileBackend } from '../src/config/backend.ts'

test('mobile backend requires an explicit HTTPS endpoint without credentials or query tokens', () => {
  for (const input of [undefined, '', 'http://localhost:8080', 'not-a-url', 'https://u:p@example.com', 'https://example.com?token=x']) {
    assert.equal(resolveMobileBackend(input), '')
  }
  assert.equal(resolveMobileBackend(' https://example.com/api/ '), 'https://example.com/api')
})
