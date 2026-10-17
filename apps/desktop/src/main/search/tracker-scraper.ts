import { extractInfoHashFromMagnet, type TorrentSearchResult } from './provider-policy.ts'

export interface SwarmStats {
  seeders: number
  leechers: number
}

export type SwarmScraperFn = (
  infoHashes: string[],
  customTrackers?: string[],
  timeoutMs?: number
) => Promise<Map<string, SwarmStats>>

const DEFAULT_SCRAPE_TIMEOUT_MS = 2500

// UDP scrapes via bittorrent-tracker return zeros, so only HTTP(S) trackers are used.
const HTTP_SCRAPE_TRACKERS = [
  'http://tracker.opentrackr.org:1337/announce',
  'http://tracker.qu.ax:6969/announce',
  'http://tracker2.dler.org:80/announce'
]

/**
 * HTTP trackers return the info hash as hex of its ASCII-hex string (80 chars).
 * Normalizes either form to a 40-char lowercase hex hash.
 */
export function decodeScrapeInfoHash(raw: unknown): string {
  const value = String(raw ?? '').toLowerCase()
  if (/^[a-f0-9]{80}$/.test(value)) {
    const decoded = Buffer.from(value, 'hex').toString('latin1').toLowerCase()
    if (/^[a-f0-9]{40}$/.test(decoded)) return decoded
  }
  return value
}

/**
 * Scrapes BitTorrent trackers for swarm health (seeders and leechers).
 * Returns a map of lowercase hex info hash -> SwarmStats.
 * Queries HTTP trackers concurrently; bounded to <= 2.5s.
 */
export async function scrapeSwarmHealth(
  infoHashes: string[],
  customTrackers: string[] = [],
  timeoutMs = DEFAULT_SCRAPE_TIMEOUT_MS
): Promise<Map<string, SwarmStats>> {
  const normalizedHashes = [...new Set(
    infoHashes.map((h) => h.toLowerCase()).filter((h) => /^[a-f0-9]{40}$/.test(h))
  )]

  const results = new Map<string, SwarmStats>()
  for (const hash of normalizedHashes) {
    results.set(hash, { seeders: 0, leechers: 0 })
  }

  if (normalizedHashes.length === 0) return results

  const trackerUrls = [...new Set([
    ...customTrackers.filter((t) => t.startsWith('http:') || t.startsWith('https:')),
    ...HTTP_SCRAPE_TRACKERS
  ])].slice(0, 4)

  if (trackerUrls.length === 0) return results

  const boundedTimeout = Math.min(Math.max(timeoutMs, 100), 2500)

  // The Electron main bundle is CommonJS, but this dependency exposes only
  // an ESM import entry. Load it lazily so Rollup preserves native import().
  let Client: typeof import('bittorrent-tracker')['default']
  try {
    ;({ default: Client } = await import('bittorrent-tracker'))
  } catch {
    return results
  }

  return new Promise((resolve) => {
    let settled = false
    let client: any = null

    try {
      client = new Client({
        infoHash: normalizedHashes[0],
        announce: trackerUrls,
        peerId: Buffer.from('01234567890123456789'),
        port: 6881
      })
    } catch {
      resolve(results)
      return
    }

    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        client?.destroy()
      } catch {
        // Safe cleanup
      }
      resolve(results)
    }

    const timer = setTimeout(finish, boundedTimeout)

    client.on('scrape', (data: any) => {
      if (!data || typeof data !== 'object') return
      const hash = decodeScrapeInfoHash(data.infoHash)
      const current = results.get(hash)
      if (!current) return

      results.set(hash, {
        seeders: Math.max(current.seeders, Number(data.complete) || 0),
        leechers: Math.max(current.leechers, Number(data.incomplete) || 0)
      })

      const allResolved = normalizedHashes.every((h) => (results.get(h)?.seeders ?? 0) > 0)
      if (allResolved) {
        finish()
      }
    })

    client.on('error', () => {
      // Swarm errors on individual trackers are non-fatal
    })

    client.on('warning', () => {
      // Swarm warnings on individual trackers are non-fatal
    })

    try {
      client.scrape({ infoHash: normalizedHashes })
    } catch {
      finish()
    }
  })
}

/**
 * Checks whether a provider uses dummy or placeholder seeders.
 * TokyoTosho always reports 0, SubsPlease reports a dummy 10, AniDex reports 0.
 */
export function isPlaceholderSwarmSource(result: TorrentSearchResult): boolean {
  return result.provider === 'TokyoTosho'
    || result.provider === 'SubsPlease'
    || (result.provider === 'AniDex' && result.seeders === 0)
}

/**
 * Enriches sources having dummy/placeholder swarm numbers with real tracker counts.
 * Uses bounded timeout (<=2.5s) and graceful fallback to original counts.
 */
export async function enrichPlaceholderSwarmCounts(
  results: TorrentSearchResult[],
  scraper: SwarmScraperFn = scrapeSwarmHealth,
  timeoutMs = DEFAULT_SCRAPE_TIMEOUT_MS
): Promise<TorrentSearchResult[]> {
  const placeholderResults = results.filter(isPlaceholderSwarmSource)
  if (placeholderResults.length === 0) return results

  const hashToTrackers = new Map<string, string[]>()
  for (const item of placeholderResults) {
    const hash = extractInfoHashFromMagnet(item.magnetURI)
    if (!hash) continue
    try {
      const magnet = new URL(item.magnetURI)
      const trackers = magnet.searchParams.getAll('tr')
      hashToTrackers.set(hash, trackers)
    } catch {
      hashToTrackers.set(hash, [])
    }
  }

  const hashesToScrape = [...hashToTrackers.keys()]
  if (hashesToScrape.length === 0) return results

  const allCustomTrackers = [...new Set([...hashToTrackers.values()].flat())]

  try {
    const swarmMap = await scraper(hashesToScrape, allCustomTrackers, timeoutMs)

    return results.map((item) => {
      if (!isPlaceholderSwarmSource(item)) return item
      const hash = extractInfoHashFromMagnet(item.magnetURI)
      if (!hash) return item
      const swarm = swarmMap.get(hash.toLowerCase())
      if (!swarm) return item

      if (swarm.seeders > 0) {
        return {
          ...item,
          seeders: swarm.seeders,
          leechers: swarm.leechers > 0 ? swarm.leechers : item.leechers
        }
      }
      return item
    })
  } catch {
    // Graceful fallback to original results on any unhandled error
    return results
  }
}
