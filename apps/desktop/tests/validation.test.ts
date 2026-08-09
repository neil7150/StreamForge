import assert from 'node:assert/strict'
import test from 'node:test'
import {
  requireFileIndex,
  requireFiniteNumber,
  requireInfoHash,
  requireMagnetURI,
  requireSearchQuery
} from '../src/main/ipc/validation.ts'

const HASH = '0123456789abcdef0123456789abcdef01234567'

test('accepts and normalizes valid torrent identifiers', () => {
  assert.equal(requireInfoHash(HASH.toUpperCase()), HASH)
  assert.equal(
    requireMagnetURI(`magnet:?xt=urn:btih:${HASH}&dn=Example`),
    `magnet:?xt=urn:btih:${HASH}&dn=Example`
  )
})

test('rejects malformed privileged inputs', () => {
  assert.throws(() => requireInfoHash('../bad'))
  assert.throws(() => requireMagnetURI('https://example.com/file'))
  assert.throws(() => requireFileIndex(-1))
  assert.throws(() => requireFiniteNumber(Number.NaN, 'position', 0, 1))
  assert.throws(() => requireSearchQuery(' '))
})

test('accepts bounded numeric and search inputs', () => {
  assert.equal(requireFileIndex(4), 4)
  assert.equal(requireFiniteNumber(0.5, 'position', 0, 1), 0.5)
  assert.equal(requireSearchQuery('  public domain movie  '), 'public domain movie')
})
