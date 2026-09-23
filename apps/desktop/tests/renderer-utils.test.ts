import assert from 'node:assert/strict'
import test from 'node:test'
import { extractInfoHash } from '../src/renderer/src/lib/utils.ts'

const HASH = '0123456789abcdef0123456789abcdef01234567'

test('extracts info hashes from raw and URL-encoded magnet topics', () => {
  assert.equal(extractInfoHash(`magnet:?xt=urn:btih:${HASH}&dn=Example`), HASH)
  assert.equal(extractInfoHash(`magnet:?xt=urn%3Abtih%3A${HASH}&dn=Example`), HASH)
})

test('rejects malformed or non-magnet identifiers', () => {
  assert.equal(extractInfoHash('https://example.test/video'), null)
  assert.equal(extractInfoHash('magnet:?xt=urn%3Abtih%3Anot-a-hash'), null)
})
