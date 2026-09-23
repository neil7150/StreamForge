import assert from 'node:assert/strict'
import test from 'node:test'
import {
  escapeInternetArchiveQuery,
  parseAnimeToshoPayload,
  parseInternetArchivePayload,
  parseKnabenPayload,
  parseStremioStreamPayload,
  parseTokyoToshoFeed
} from '../src/main/search/provider-parsers.ts'
import { extractInfoHashFromMagnet } from '../src/main/search/provider-policy.ts'
import { extractInfoHash as extractRendererInfoHash } from '../src/renderer/src/lib/utils.ts'

const HASH = '0123456789abcdef0123456789abcdef01234567'

test('parses Anime Tosho archive results with swarm and batch metadata', () => {
  const results = parseAnimeToshoPayload([{
    id: 42,
    title: '[Group] Bleach 001-366 Complete',
    info_hash: HASH,
    seeders: 74,
    leechers: 3,
    total_size: 123456789,
    timestamp: 1_700_000_000
  }])

  assert.equal(results.length, 1)
  assert.equal(results[0].provider, 'AnimeTosho')
  assert.equal(results[0].seeders, 74)
  assert.equal(results[0].sizeBytes, 123456789)
  assert.equal(extractInfoHashFromMagnet(results[0].magnetURI), HASH)
})

test('parses safe Knaben API results with current swarm counts', () => {
  const results = parseKnabenPayload({ hits: [{
    id: 'release-id',
    title: 'Example Show S01E02 1080p WEB-DL',
    hash: HASH,
    magnetUrl: `magnet:?xt=urn:btih:${HASH}&dn=Example`,
    bytes: 700_000_000,
    seeders: 81,
    peers: 7,
    category: 'TV / HD',
    date: '2026-08-15T10:00:00Z'
  }] })
  assert.equal(results.length, 1)
  assert.equal(results[0].provider, 'Knaben')
  assert.equal(results[0].seeders, 81)
  assert.equal(results[0].category, 'TV / HD')
  assert.equal(extractRendererInfoHash(results[0].magnetURI), HASH)
})

test('parses torrent-only Stremio addon streams and preserves the episode file index', () => {
  const results = parseStremioStreamPayload({ streams: [
    { name: 'Comet', title: '1080p · 52 seeders · 1.2 GiB', infoHash: HASH, fileIdx: 14, behaviorHints: { videoSize: 1_288_490_189 } },
    { name: 'Direct URL', title: 'Not a torrent', url: 'https://example.test/video.mp4' }
  ] }, 2)
  assert.equal(results.length, 1)
  assert.equal(results[0].provider, 'StremioAddon')
  assert.equal(results[0].fileIndex, 14)
  assert.equal(results[0].seeders, 52)
  assert.equal(results[0].sizeBytes, 1_288_490_189)
})

test('parses Tokyo Toshokan RSS magnets and safely ignores download-only entries', () => {
  const feed = `<?xml version="1.0"?><rss><channel>
    <item><title><![CDATA[Bleach 014 1080p]]></title><link><![CDATA[magnet:?xt=urn:btih:${HASH}&dn=Bleach]]></link><description>Size: 1.5 GiB</description><pubDate>Tue, 14 Nov 2023 22:13:20 GMT</pubDate></item>
    <item><title>No magnet</title><link>https://example.test/file.torrent</link></item>
  </channel></rss>`
  const results = parseTokyoToshoFeed(feed)

  assert.equal(results.length, 1)
  assert.equal(results[0].provider, 'TokyoTosho')
  assert.equal(results[0].sizeBytes, Math.round(1.5 * 1024 ** 3))
  assert.equal(extractInfoHashFromMagnet(results[0].magnetURI), HASH)
})

test('parses Internet Archive movie torrents and release dates', () => {
  const results = parseInternetArchivePayload({ response: { docs: [{
    identifier: 'night-of-the-living-dead',
    title: 'Night of the Living Dead',
    btih: HASH,
    item_size: 987654321,
    date: '1968-10-01T00:00:00Z'
  }] } })

  assert.equal(results.length, 1)
  assert.equal(results[0].provider, 'InternetArchive')
  assert.equal(results[0].added, '1968')
  assert.equal(results[0].seeders, 0)
  assert.equal(extractInfoHashFromMagnet(results[0].magnetURI), HASH)
  assert.equal(escapeInternetArchiveQuery('Wall-E: A Movie'), 'Wall\\-E\\: A Movie')
})

test('rejects malformed provider payloads', () => {
  assert.throws(() => parseAnimeToshoPayload({}), /Invalid Anime Tosho response/)
  assert.throws(() => parseTokyoToshoFeed('<html></html>'), /Invalid Tokyo Toshokan response/)
  assert.throws(() => parseInternetArchivePayload({ response: {} }), /Invalid Internet Archive response/)
  assert.throws(() => parseKnabenPayload({}), /Invalid Knaben response/)
  assert.throws(() => parseStremioStreamPayload({}, 0), /Invalid Stremio addon response/)
})
