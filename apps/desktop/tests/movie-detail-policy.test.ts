import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMovieCatalogId } from '../src/renderer/src/lib/movie-detail-policy.ts'

test('accepts provider-qualified movie route IDs', () => {
  assert.equal(parseMovieCatalogId('cinemeta:tt0137523'), 'cinemeta:tt0137523')
  assert.equal(parseMovieCatalogId('YTS:42'), 'yts:42')
  assert.equal(parseMovieCatalogId('cinemeta%3Att0137523'), 'cinemeta:tt0137523')
  assert.equal(parseMovieCatalogId('42'), null)
  assert.equal(parseMovieCatalogId('cinemeta:bad'), null)
  assert.equal(parseMovieCatalogId(undefined), null)
})
