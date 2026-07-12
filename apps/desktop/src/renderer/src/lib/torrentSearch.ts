/**
 * Torrent Search Service
 * Uses apibay.org (The Pirate Bay API) for real torrent search.
 */

export interface TorrentSearchResult {
  id: string
  name: string
  magnetURI: string
  seeders: number
  leechers: number
  size: string
  sizeBytes: number
  category: string
  added: string
}

/** Common public trackers appended to every magnet link */
const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.openbittorrent.com:80/announce',
  'udp://tracker.leechers-paradise.org:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.coppersurfer.tk:6969/announce',
  'udp://tracker.empire-js.us:1337/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.fastcast.nz'
]

/** TPB category map */
const CATEGORY_MAP: Record<string, string> = {
  '100': 'Audio',
  '101': 'Music',
  '200': 'Video',
  '201': 'Movies',
  '202': 'TV',
  '205': 'TV',
  '207': 'HD Movies',
  '208': 'HD TV',
  '300': 'Apps',
  '301': 'Windows',
  '400': 'Games',
  '500': 'Porn',
  '600': 'Other',
  '601': 'E-Books',
  '602': 'Comics',
  '603': 'Pictures',
}

function getCategoryLabel(catId: string): string {
  return CATEGORY_MAP[catId] || 'Other'
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`
}

function buildMagnetURI(infoHash: string, name: string): string {
  const trackerParams = TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${trackerParams}`
}

function formatDate(timestamp: string): string {
  try {
    const ts = parseInt(timestamp, 10)
    if (isNaN(ts)) return ''
    const d = new Date(ts * 1000)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export async function searchTorrents(query: string): Promise<TorrentSearchResult[]> {
  if (!query.trim()) return []

  const fetchApibay = async (): Promise<TorrentSearchResult[]> => {
    try {
      const res = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(query.trim())}`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const data = await res.json()
      if (!Array.isArray(data) || data.length === 0) return []
      if (data.length === 1 && data[0].name === 'No results returned') return []

      return data
        .filter((item: any) => item.info_hash && item.info_hash !== '0000000000000000000000000000000000000000')
        .map((item: any) => {
          const sizeBytes = parseInt(item.size, 10) || 0
          return {
            id: item.id,
            name: item.name,
            magnetURI: buildMagnetURI(item.info_hash, item.name),
            seeders: parseInt(item.seeders, 10) || 0,
            leechers: parseInt(item.leechers, 10) || 0,
            size: formatFileSize(sizeBytes),
            sizeBytes,
            category: getCategoryLabel(item.category),
            added: formatDate(item.added)
          }
        })
    } catch (err) {
      console.error('[TorrentSearch] APIBay failed:', err)
      return []
    }
  }

  const fetchNyaa = async (): Promise<TorrentSearchResult[]> => {
    try {
      const results = await window.torrentAPI.searchNyaa(query)
      // Nyaa results from backend don't have trackers appended to magnetURI yet
      return results.map(item => {
        // Find the hash in the base magnet URI from the backend
        const match = item.magnetURI.match(/btih:([a-fA-F0-9]{40})/i)
        const hash = match ? match[1] : ''
        return {
          ...item,
          magnetURI: buildMagnetURI(hash, item.name)
        }
      })
    } catch (err) {
      console.error('[TorrentSearch] Nyaa failed:', err)
      return []
    }
  }

  try {
    const [apibayRes, nyaaRes] = await Promise.all([
      fetchApibay(),
      fetchNyaa()
    ])

    // Merge and sort by seeders descending
    const combined = [...apibayRes, ...nyaaRes]
    return combined.sort((a, b) => b.seeders - a.seeders)
  } catch (err) {
    console.error('[TorrentSearch] Search failed:', err)
    return []
  }
}
