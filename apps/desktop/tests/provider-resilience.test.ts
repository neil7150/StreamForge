import assert from 'node:assert/strict'
import test from 'node:test'
import { ProviderHealthTracker, SearchResponseCache } from '../src/main/search/provider-resilience.ts'
import { buildMagnetURI, type TorrentSearchResponse } from '../src/main/search/provider-policy.ts'

const HASH = '0123456789abcdef0123456789abcdef01234567'

function response(): TorrentSearchResponse {
  return {
    results: [{
      id: 'cached-result',
      name: 'Public domain movie 1080p H264 AAC',
      magnetURI: buildMagnetURI(HASH, 'Public domain movie') ?? '',
      seeders: 20,
      leechers: 2,
      size: '1.0 GB',
      sizeBytes: 1024 ** 3,
      category: 'Movies',
      added: '',
      provider: 'APIBay'
    }],
    providers: [{ name: 'APIBay', status: 'ok', count: 1 }],
    cache: 'miss'
  }
}

test('opens a provider circuit after repeated failures and recovers after cooldown', () => {
  let now = 1_000
  const tracker = new ProviderHealthTracker(2, 500, () => now)

  assert.equal(tracker.canRequest('APIBay').allowed, true)
  tracker.recordFailure('APIBay', 40)
  assert.equal(tracker.canRequest('APIBay').allowed, true)
  tracker.recordFailure('APIBay', 50)

  const paused = tracker.canRequest('APIBay')
  assert.equal(paused.allowed, false)
  assert.equal(paused.consecutiveFailures, 2)
  assert.equal(paused.retryAt, 1_500)

  now = 1_501
  assert.equal(tracker.canRequest('APIBay').allowed, true)
  tracker.recordSuccess('APIBay', 25)
  assert.equal(tracker.canRequest('APIBay').consecutiveFailures, 0)
})

test('serves fresh and stale cached searches until the stale lifetime expires', () => {
  let now = 10_000
  const cache = new SearchResponseCache(100, 500, 10, () => now)
  cache.set('  Public   Movie ', response())

  const fresh = cache.getFresh('public movie')
  assert.ok(fresh)
  fresh.response.results[0].name = 'mutated clone'
  assert.notEqual(cache.getFresh('PUBLIC MOVIE')?.response.results[0].name, 'mutated clone')

  now += 101
  assert.equal(cache.getFresh('public movie'), null)
  assert.ok(cache.getStale('public movie'))

  now += 400
  assert.equal(cache.getStale('public movie'), null)
})

test('evicts the least recently used cached search at capacity', () => {
  let now = 0
  const cache = new SearchResponseCache(100, 1_000, 2, () => now)
  cache.set('one', response())
  now += 1
  cache.set('two', response())
  cache.getFresh('one')
  now += 1
  cache.set('three', response())

  assert.ok(cache.getFresh('one'))
  assert.equal(cache.getFresh('two'), null)
  assert.ok(cache.getFresh('three'))
})
