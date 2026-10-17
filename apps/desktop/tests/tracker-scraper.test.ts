import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decodeScrapeInfoHash,
  enrichPlaceholderSwarmCounts,
  isPlaceholderSwarmSource,
  scrapeSwarmHealth,
  type SwarmStats
} from '../src/main/search/tracker-scraper.ts'

test('decodeScrapeInfoHash decodes double-hex HTTP tracker hashes', () => {
  const hash = '224bf45881252643dfc2e71abc7b2660a21c68c4'
  const doubled = Buffer.from(hash, 'latin1').toString('hex')
  assert.equal(doubled.length, 80)
  assert.equal(decodeScrapeInfoHash(doubled), hash)
  assert.equal(decodeScrapeInfoHash(hash.toUpperCase()), hash)
})
import type { TorrentSearchResult } from '../src/main/search/provider-policy.ts'

const HASH_1 = '0123456789abcdef0123456789abcdef01234567'
const HASH_2 = 'abcdef0123456789abcdef0123456789abcdef01'
const HASH_3 = 'fedcba9876543210fedcba9876543210fedcba98'

function createSource(
  id: string,
  name: string,
  provider: any,
  seeders: number,
  hash: string
): TorrentSearchResult {
  return {
    id,
    name,
    magnetURI: `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}&tr=udp%3A%2F%2Ftracker.example.com%3A1337`,
    seeders,
    leechers: 0,
    size: '1.2 GB',
    sizeBytes: 1200000000,
    category: 'Anime',
    added: '2026-10-01',
    provider
  }
}

test('isPlaceholderSwarmSource identifies TokyoTosho, SubsPlease, and empty AniDex', () => {
  assert.equal(isPlaceholderSwarmSource(createSource('1', 'Show 01', 'TokyoTosho', 0, HASH_1)), true)
  assert.equal(isPlaceholderSwarmSource(createSource('2', 'Show 01', 'SubsPlease', 10, HASH_2)), true)
  assert.equal(isPlaceholderSwarmSource(createSource('3', 'Show 01', 'AniDex', 0, HASH_3)), true)
  assert.equal(isPlaceholderSwarmSource(createSource('4', 'Show 01', 'AniDex', 5, HASH_3)), false)
  assert.equal(isPlaceholderSwarmSource(createSource('5', 'Show 01', 'Nyaa', 25, HASH_1)), false)
  assert.equal(isPlaceholderSwarmSource(createSource('6', 'Show 01', 'APIBay', 0, HASH_1)), false)
})

test('enrichPlaceholderSwarmCounts updates dummy counts with real scraped counts', async () => {
  const sources: TorrentSearchResult[] = [
    createSource('tokyo-1', '[Group] Attack on Titan 01', 'TokyoTosho', 0, HASH_1),
    createSource('subs-1', '[SubsPlease] Attack on Titan - 01', 'SubsPlease', 10, HASH_2),
    createSource('nyaa-1', 'Attack on Titan S01E01', 'Nyaa', 35, HASH_3)
  ]

  const mockScraper = async (hashes: string[]): Promise<Map<string, SwarmStats>> => {
    const map = new Map<string, SwarmStats>()
    if (hashes.includes(HASH_1)) map.set(HASH_1, { seeders: 85, leechers: 4 })
    if (hashes.includes(HASH_2)) map.set(HASH_2, { seeders: 120, leechers: 12 })
    return map
  }

  const enriched = await enrichPlaceholderSwarmCounts(sources, mockScraper, 1000)

  assert.equal(enriched[0].seeders, 85)
  assert.equal(enriched[0].leechers, 4)
  assert.equal(enriched[1].seeders, 120)
  assert.equal(enriched[1].leechers, 12)
  // Non-placeholder source must remain unchanged
  assert.equal(enriched[2].seeders, 35)
})

test('enrichPlaceholderSwarmCounts gracefully falls back to dummy counts on failure', async () => {
  const sources: TorrentSearchResult[] = [
    createSource('tokyo-1', 'Show 01', 'TokyoTosho', 0, HASH_1),
    createSource('subs-1', 'Show 01', 'SubsPlease', 10, HASH_2)
  ]

  const failingScraper = async (): Promise<Map<string, SwarmStats>> => {
    throw new Error('Tracker connection failed')
  }

  const result = await enrichPlaceholderSwarmCounts(sources, failingScraper, 1000)

  assert.equal(result[0].seeders, 0)
  assert.equal(result[1].seeders, 10)
})

test('enrichPlaceholderSwarmCounts does not downgrade when scraped seeders are 0', async () => {
  const sources: TorrentSearchResult[] = [
    createSource('subs-1', 'Show 01', 'SubsPlease', 10, HASH_2)
  ]

  const zeroScraper = async (): Promise<Map<string, SwarmStats>> => {
    const map = new Map<string, SwarmStats>()
    map.set(HASH_2, { seeders: 0, leechers: 0 })
    return map
  }

  const result = await enrichPlaceholderSwarmCounts(sources, zeroScraper, 1000)
  assert.equal(result[0].seeders, 10)
})

test('scrapeSwarmHealth handles empty and invalid hashes safely', async () => {
  const emptyResult = await scrapeSwarmHealth([])
  assert.equal(emptyResult.size, 0)

  const invalidResult = await scrapeSwarmHealth(['not-a-hash', '123'])
  assert.equal(invalidResult.size, 0)
})

test('scrapeSwarmHealth returns zero stats safely when no custom or default trackers respond', async () => {
  const result = await scrapeSwarmHealth([HASH_1], ['http://127.0.0.1:9/announce'], 100)
  assert.equal(result.size, 1)
  assert.equal(result.get(HASH_1)?.seeders, 0)
  assert.equal(result.get(HASH_1)?.leechers, 0)
})

