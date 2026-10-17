import assert from 'node:assert/strict'
import test from 'node:test'
import parseTorrent from 'parse-torrent'
import {
  appendFallbackTrackers,
  buildMagnetURI,
  compareTorrentSourcesBySeeders,
  decodeXmlText,
  deduplicateResults,
  extractInfoHashFromMagnet,
  normalizeInfoHash,
  parseFileSize,
  sourceQualityScore,
  type TorrentSearchResult
} from '../src/main/search/provider-policy.ts'

const HASH_A = '0123456789abcdef0123456789abcdef01234567'
const HASH_B = '89abcdef0123456789abcdef0123456789abcdef'
const HASH_A_BASE32 = 'AERUKZ4JVPG66AJDIVTYTK6N54ASGRLH'

function result(hash: string, seeders: number, provider: 'APIBay' | 'Nyaa'): TorrentSearchResult {
  return {
    id: `${provider}-${hash}`,
    name: 'Example',
    magnetURI: buildMagnetURI(hash, 'Example') ?? '',
    seeders,
    leechers: 2,
    size: '1.0 GiB',
    sizeBytes: 1024 ** 3,
    category: 'Movies',
    added: '',
    provider
  }
}

test('builds magnets only from valid hexadecimal info hashes', () => {
  const magnet = buildMagnetURI(HASH_A.toUpperCase(), 'Public domain movie')
  assert.ok(magnet)
  assert.equal(extractInfoHashFromMagnet(magnet), HASH_A)
  const trackers = new URL(magnet).searchParams.getAll('tr')
  assert.ok(trackers.some((tracker) => tracker.startsWith('http://')))
  assert.ok(trackers.some((tracker) => tracker.startsWith('udp://')))
  assert.ok(trackers.some((tracker) => tracker.startsWith('wss://')))
  assert.equal(buildMagnetURI('not-a-hash', 'Bad'), null)
  assert.equal(extractInfoHashFromMagnet('magnet:?xt=urn:btih:'), null)
})

test('normalizes base32 info hashes to hexadecimal', () => {
  assert.equal(normalizeInfoHash(HASH_A_BASE32), HASH_A)
  assert.equal(normalizeInfoHash(HASH_A_BASE32.toLowerCase()), HASH_A)
  assert.equal(extractInfoHashFromMagnet(`magnet:?xt=urn:btih:${HASH_A_BASE32}&dn=Example`), HASH_A)
  assert.equal(extractInfoHashFromMagnet(`magnet:?dn=Example&xt=urn:btih:${HASH_A_BASE32}`), HASH_A)
  assert.equal(extractInfoHashFromMagnet(`magnet:?xt=urn%3Abtih%3A${HASH_A_BASE32}&dn=Example`), HASH_A)
  assert.equal(extractInfoHashFromMagnet(`xt=urn%3Abtih%3A${HASH_A_BASE32}`), HASH_A)
  assert.equal(buildMagnetURI(HASH_A_BASE32, 'Example')?.includes(`btih:${HASH_A}`), true)
  // 32 chars but contains invalid base32 digits (0, 1, 8, 9)
  assert.equal(normalizeInfoHash('01890189018901890189018901890189'), null)
})

test('adds fallback trackers without breaking WebTorrent magnet parsing', async () => {
  const savedMagnet = `magnet:?xt=urn:btih:${HASH_A}&tr=${encodeURIComponent('http://tracker.qu.ax:6969/announce')}`
  const updated = appendFallbackTrackers(savedMagnet)
  const trackers = new URL(updated).searchParams.getAll('tr')

  assert.equal(trackers.length, new Set(trackers).size)
  assert.ok(trackers.length > 1)
  assert.equal(extractInfoHashFromMagnet(updated), HASH_A)
  assert.match(updated, /xt=urn:btih:/)
  assert.equal((await parseTorrent(updated)).infoHash, HASH_A)

  const base32Magnet = `magnet:?xt=urn:btih:${HASH_A_BASE32}&dn=Example`
  const base32Updated = appendFallbackTrackers(base32Magnet)
  assert.equal(extractInfoHashFromMagnet(base32Updated), HASH_A)
  assert.equal((await parseTorrent(base32Updated)).infoHash, HASH_A)
})

test('deduplicates providers by hash and keeps the healthier result', () => {
  const results = deduplicateResults([
    result(HASH_A, 5, 'APIBay'),
    result(HASH_A, 20, 'Nyaa'),
    result(HASH_B, 10, 'APIBay')
  ])

  assert.equal(results.length, 2)
  assert.equal(results[0].seeders, 20)
  assert.equal(results[0].provider, 'Nyaa')
})

test('ranks browser-compatible sources above similarly healthy transcode sources', () => {
  const directPlay = { ...result(HASH_A, 40, 'APIBay'), name: 'Movie 1080p H264 AAC' }
  const transcode = { ...result(HASH_B, 40, 'Nyaa'), name: 'Movie 1080p HEVC AC3' }

  assert.ok(sourceQualityScore(directPlay) > sourceQualityScore(transcode))
  assert.equal(deduplicateResults([transcode, directPlay])[0].name, directPlay.name)
})

test('ranks seed count before compatibility and other quality signals', () => {
  const compatible = { ...result(HASH_A, 20, 'APIBay'), name: 'Movie 1080p H264 AAC' }
  const moreSeeded = { ...result(HASH_B, 80, 'Nyaa'), name: 'Movie 1080p HEVC AC3' }

  assert.ok(sourceQualityScore(compatible) > sourceQualityScore({ ...moreSeeded, seeders: 20 }))
  assert.ok(compareTorrentSourcesBySeeders(moreSeeded, compatible) < 0)
  assert.equal(deduplicateResults([compatible, moreSeeded])[0].name, moreSeeded.name)
})

test('parses provider sizes and XML entities safely', () => {
  assert.equal(parseFileSize('1.5 GiB'), Math.round(1.5 * 1024 ** 3))
  assert.equal(parseFileSize('700 MiB'), 700 * 1024 ** 2)
  assert.equal(parseFileSize('unknown'), 0)
  assert.equal(decodeXmlText('<![CDATA[Tom &amp; Jerry]]>'), 'Tom & Jerry')
})
