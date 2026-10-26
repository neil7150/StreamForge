import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareMobileMagnet } from '../src/data/mobile-magnet.ts'
import { bufferingTimeoutMessage, isUnregisteredPreparingSession, playbackErrorMessage } from '../src/playback/playback-errors.ts'

const hash = '1234567890123456789012345678901234567890'
test('trackerless magnets get bounded native trackers and retain file/peer hints', () => {
  const magnet = new URL(prepareMobileMagnet(`magnet:?xt=urn:btih:${hash}&dn=Example&so=2&x.pe=1.2.3.4:5555`))
  assert.equal(magnet.searchParams.get('xt'), `urn:btih:${hash}`)
  assert.equal(magnet.searchParams.get('so'), '2')
  assert.equal(magnet.searchParams.get('x.pe'), '1.2.3.4:5555')
  const trackers = magnet.searchParams.getAll('tr')
  assert.ok(trackers.length > 0 && trackers.length <= 8)
  assert.ok(trackers.some(value => value.startsWith('https:')))
  assert.ok(trackers.every(value => /^(udp|https?):/.test(value)))
})

test('supplied native trackers including private passkeys are preserved without extra public trackers', () => {
  const url = `magnet:?xt=urn:btih:${hash}&tr=${encodeURIComponent('https://example.com/private-passkey/announce')}&tr=${encodeURIComponent('wss://example.com')}`
  assert.deepEqual(new URL(prepareMobileMagnet(url)).searchParams.getAll('tr'), ['https://example.com/private-passkey/announce'])
  assert.equal(prepareMobileMagnet(prepareMobileMagnet(url)), prepareMobileMagnet(url))
  assert.throws(() => prepareMobileMagnet('not a magnet'), /Invalid magnet/)
  assert.throws(() => prepareMobileMagnet(`https://example.com/?xt=urn:btih:${hash}`), /Invalid magnet/)
})

test('native metadata rejection becomes actionable text without Java stack plumbing', () => {
  const error = new Error("Call to function 'TorrentDaemon.prepareSession' has been rejected. → Caused by: java.lang.IllegalStateException: timed out waiting for torrent metadata")
  assert.match(playbackErrorMessage(error), /file list/)
  assert.doesNotMatch(playbackErrorMessage(error), /java|IllegalState|prepareSession/)
  assert.match(playbackErrorMessage(new Error('device storage is low')), /free device storage/)
  assert.match(playbackErrorMessage(new Error('java.lang.IllegalStateException: other')), /another source/)
})

test('file-list discovery and playable-video buffering have distinct failure messages', () => {
  assert.match(bufferingTimeoutMessage('metadata'), /file list/)
  assert.match(bufferingTimeoutMessage('video'), /playable data/)
})

test('early session polling tolerates only the registration race, not storage failures', () => {
  assert.equal(isUnregisteredPreparingSession(new Error('java.lang.IllegalStateException: session not active')), true)
  assert.equal(isUnregisteredPreparingSession(new Error('device storage is low')), false)
  assert.equal(isUnregisteredPreparingSession(new Error('cache unavailable')), false)
})
