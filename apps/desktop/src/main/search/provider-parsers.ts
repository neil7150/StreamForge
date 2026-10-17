import {
  appendFallbackTrackers,
  buildMagnetURI,
  decodeXmlText,
  extractInfoHashFromMagnet,
  formatFileSize,
  normalizeInfoHash,
  parseFileSize,
  type TorrentSearchResult
} from './provider-policy.ts'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function unixDate(value: unknown): string {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function isoDate(value: unknown): string {
  const raw = asString(value)
  if (!raw) return ''
  const date = new Date(raw)
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : ''
}

function readXmlTag(itemXml: string, tag: string): string {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = itemXml.match(new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, 'i'))
  return match ? decodeXmlText(match[1]) : ''
}

export function parseAnimeToshoPayload(payload: unknown): TorrentSearchResult[] {
  if (!Array.isArray(payload)) throw new Error('Invalid Anime Tosho response')
  const results: TorrentSearchResult[] = []
  for (const value of payload) {
    const item = asRecord(value)
    if (!item) continue
    const name = asString(item.title).trim() || asString(item.torrent_name).trim()
    const hash = normalizeInfoHash(item.info_hash)
    const suppliedMagnet = asString(item.magnet_uri).trim()
    const magnetURI = suppliedMagnet.startsWith('magnet:') && extractInfoHashFromMagnet(suppliedMagnet)
      ? appendFallbackTrackers(suppliedMagnet)
      : (hash ? buildMagnetURI(hash, name) : null)
    if (!name || !magnetURI) continue
    const sizeBytes = Math.round(asNumber(item.total_size))
    results.push({
      id: `animetosho-${asString(item.id) || hash || results.length}`,
      name,
      magnetURI,
      seeders: Math.round(asNumber(item.seeders)),
      leechers: Math.round(asNumber(item.leechers)),
      size: formatFileSize(sizeBytes),
      sizeBytes,
      category: 'Anime',
      added: unixDate(item.timestamp),
      provider: 'AnimeTosho'
    })
  }
  return results
}

export function parseKnabenPayload(payload: unknown): TorrentSearchResult[] {
  const root = asRecord(payload)
  if (!Array.isArray(root?.hits)) throw new Error('Invalid Knaben response')
  const results: TorrentSearchResult[] = []
  for (const value of root.hits) {
    const item = asRecord(value)
    if (!item) continue
    const name = asString(item.title).trim()
    const hash = normalizeInfoHash(item.hash)
    const suppliedMagnet = asString(item.magnetUrl).trim()
    const magnetURI = suppliedMagnet.startsWith('magnet:') && extractInfoHashFromMagnet(suppliedMagnet)
      ? appendFallbackTrackers(suppliedMagnet)
      : (hash ? buildMagnetURI(hash, name) : null)
    if (!name || !magnetURI) continue
    const sizeBytes = Math.round(asNumber(item.bytes))
    results.push({
      id: `knaben-${asString(item.id) || hash || results.length}`,
      name,
      magnetURI,
      seeders: Math.round(asNumber(item.seeders)),
      leechers: Math.round(asNumber(item.peers)),
      size: formatFileSize(sizeBytes),
      sizeBytes,
      category: asString(item.category) || 'Video',
      added: isoDate(item.date),
      provider: 'Knaben'
    })
  }
  return results
}

function numberFromText(value: string, patterns: RegExp[]): number {
  for (const pattern of patterns) {
    const match = pattern.exec(value)
    const number = Number(match?.[1])
    if (Number.isFinite(number) && number >= 0) return Math.round(number)
  }
  return 0
}

export function parseStremioStreamPayload(payload: unknown, endpointIndex: number): TorrentSearchResult[] {
  const root = asRecord(payload)
  if (!Array.isArray(root?.streams)) throw new Error('Invalid Stremio addon response')
  const results: TorrentSearchResult[] = []
  for (const value of root.streams) {
    const stream = asRecord(value)
    if (!stream) continue
    const hash = normalizeInfoHash(stream.infoHash)
    const behaviorHints = asRecord(stream.behaviorHints)
    const title = asString(stream.title).trim()
    const addonName = asString(stream.name).trim()
    const filename = asString(behaviorHints?.filename).trim()
    const name = [addonName ? `[${addonName}]` : '', title || filename].filter(Boolean).join(' ').trim()
    const magnetURI = hash ? buildMagnetURI(hash, name) : null
    if (!hash || !name || !magnetURI) continue
    const text = `${addonName} ${title} ${filename}`
    const sizeText = text.match(/([\d.]+\s*(?:[KMGT]i?B))/i)?.[1] || '0 B'
    const hintedSize = Math.round(asNumber(behaviorHints?.videoSize))
    const sizeBytes = hintedSize || parseFileSize(sizeText)
    const rawFileIndex = Number(stream.fileIdx)
    const fileIndex = Number.isSafeInteger(rawFileIndex) && rawFileIndex >= 0 && rawFileIndex <= 100_000
      ? rawFileIndex
      : undefined
    results.push({
      id: `stremio-addon-${endpointIndex}-${hash}-${fileIndex ?? 'auto'}`,
      name,
      magnetURI,
      seeders: numberFromText(text, [/(?:seeders?|👤|👥)\s*[:=]?\s*(\d+)/i, /(\d+)\s*(?:seeders?)/i]),
      leechers: 0,
      size: formatFileSize(sizeBytes),
      sizeBytes,
      category: 'TV',
      added: '',
      provider: 'StremioAddon',
      ...(fileIndex !== undefined ? { fileIndex } : {})
    })
  }
  return results
}

function magnetFromXmlItem(itemXml: string): string | null {
  const candidates = [readXmlTag(itemXml, 'link'), readXmlTag(itemXml, 'guid'), decodeXmlText(itemXml)]
  for (const candidate of candidates) {
    const match = candidate.match(/magnet:\?[^\s<'"]+/i)
    if (!match) continue
    const magnetURI = decodeXmlText(match[0])
    if (extractInfoHashFromMagnet(magnetURI)) return appendFallbackTrackers(magnetURI)
  }
  return null
}

export function parseTokyoToshoFeed(xml: string): TorrentSearchResult[] {
  if (!/<(?:rss|feed)[\s>]/i.test(xml)) throw new Error('Invalid Tokyo Toshokan response')
  const results: TorrentSearchResult[] = []
  const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi
  let match: RegExpExecArray | null
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1]
    const name = readXmlTag(itemXml, 'title').trim()
    const magnetURI = magnetFromXmlItem(itemXml)
    if (!name || !magnetURI) continue
    const description = readXmlTag(itemXml, 'description') || readXmlTag(itemXml, 'summary')
    const sizeMatch = description.match(/(?:size|length)\s*:?\s*([\d.]+\s*(?:[KMGT]i?B|bytes?))/i)
    const size = sizeMatch?.[1] || '0 B'
    const published = readXmlTag(itemXml, 'pubDate') || readXmlTag(itemXml, 'updated')
    const publishedDate = published ? new Date(published) : null
    const hash = extractInfoHashFromMagnet(magnetURI)
    results.push({
      id: `tokyotosho-${hash || results.length}`,
      name,
      magnetURI,
      seeders: 0,
      leechers: 0,
      size,
      sizeBytes: parseFileSize(size),
      category: 'Anime',
      added: publishedDate && Number.isFinite(publishedDate.getTime())
        ? publishedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : '',
      provider: 'TokyoTosho'
    })
  }
  return results
}

export function escapeInternetArchiveQuery(value: string): string {
  return value.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1')
}

export function parseInternetArchivePayload(payload: unknown): TorrentSearchResult[] {
  const root = asRecord(payload)
  const response = asRecord(root?.response)
  if (!Array.isArray(response?.docs)) throw new Error('Invalid Internet Archive response')
  const results: TorrentSearchResult[] = []
  for (const value of response.docs) {
    const item = asRecord(value)
    if (!item) continue
    const identifier = asString(item.identifier).trim()
    const title = asString(item.title).trim()
    const hash = normalizeInfoHash(item.btih)
    const magnetURI = hash ? buildMagnetURI(hash, title) : null
    if (!identifier || !title || !magnetURI) continue
    const sizeBytes = Math.round(asNumber(item.item_size))
    const date = asString(item.date)
    results.push({
      id: `internet-archive-${identifier}`,
      name: title,
      magnetURI,
      seeders: 0,
      leechers: 0,
      size: formatFileSize(sizeBytes),
      sizeBytes,
      category: 'Internet Archive Movies',
      added: /^\d{4}/.test(date) ? date.slice(0, 4) : '',
      provider: 'InternetArchive'
    })
  }
  return results
}

export interface Parsed1337xItem {
  title: string
  detailPath: string
  seeders: number
  leechers: number
  size: string
  sizeBytes: number
  category: string
  added: string
}

export function parse1337xSearchList(html: string): Parsed1337xItem[] {
  if (!html || typeof html !== 'string') return []
  const items: Parsed1337xItem[] = []
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1]
    const linkMatch = row.match(/<a[^>]*href=['"](\/torrent\/\d+\/[^'"]+)['"][^>]*>([^<]+)<\/a>/i)
    if (!linkMatch) continue
    const detailPath = linkMatch[1].trim()
    const title = decodeXmlText(linkMatch[2].trim())

    const seedsMatch = row.match(/<td[^>]*class=['"][^'"]*seeds[^'"]*['"][^>]*>(\d+)<\/td>/i)
    const leechMatch = row.match(/<td[^>]*class=['"][^'"]*leeches[^'"]*['"][^>]*>(\d+)<\/td>/i)
    const sizeMatch = row.match(/<td[^>]*class=['"][^'"]*size[^'"]*['"][^>]*>([\d.]+\s*(?:GB|MB|KB|B|TB))</i)
    const dateMatch = row.match(/<td[^>]*class=['"][^'"]*coll-date[^'"]*['"][^>]*>([^<]+)<\/td>/i)
    const catMatch = row.match(/<a[^>]*href=['"]\/sub\/\d+\/[^'"]*['"][^>]*>([^<]+)<\/a>/i)

    const size = sizeMatch?.[1]?.trim() || '0 B'
    const sizeBytes = parseFileSize(size)

    items.push({
      title,
      detailPath,
      seeders: seedsMatch ? Math.max(0, Number(seedsMatch[1])) : 0,
      leechers: leechMatch ? Math.max(0, Number(leechMatch[1])) : 0,
      size: formatFileSize(sizeBytes),
      sizeBytes,
      category: catMatch ? decodeXmlText(catMatch[1].trim()) : 'Video',
      added: dateMatch ? decodeXmlText(dateMatch[1].trim()) : ''
    })
  }
  return items
}

export function parse1337xDetailMagnet(html: string): string | null {
  if (!html || typeof html !== 'string') return null
  const magnetMatch = html.match(/href=['"](magnet:\?[^'"]+)['"]/i)
  if (!magnetMatch) return null
  const suppliedMagnet = decodeXmlText(magnetMatch[1].trim())
  if (!extractInfoHashFromMagnet(suppliedMagnet)) return null
  return appendFallbackTrackers(suppliedMagnet)
}

export function parseSubsPleasePayload(payload: unknown): TorrentSearchResult[] {
  const root = asRecord(payload)
  if (!root) return []
  const results: TorrentSearchResult[] = []

  for (const [key, val] of Object.entries(root)) {
    const item = asRecord(val)
    if (!item) continue
    const downloads = Array.isArray(item.downloads) ? item.downloads : []
    const releaseDate = asString(item.release_date) || asString(item.time)
    const pubDate = releaseDate ? new Date(releaseDate) : null
    const added = pubDate && Number.isFinite(pubDate.getTime())
      ? pubDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : asString(item.time)

    for (const dl of downloads) {
      const dlRecord = asRecord(dl)
      if (!dlRecord) continue
      const res = asString(dlRecord.res).trim()
      const rawMagnet = asString(dlRecord.magnet).trim()
      if (!rawMagnet || !rawMagnet.startsWith('magnet:')) continue
      const hash = extractInfoHashFromMagnet(rawMagnet)
      if (!hash) continue
      const magnetURI = appendFallbackTrackers(rawMagnet)
      const resLabel = res ? ` (${res}p)` : ''
      const name = `[SubsPlease] ${key}${resLabel}`
      const size = res === '1080' ? '1.4 GB' : res === '720' ? '750 MB' : res === '480' ? '350 MB' : '1.0 GB'
      const sizeBytes = parseFileSize(size)

      results.push({
        id: `subsplease-${hash}`,
        name,
        magnetURI,
        seeders: 10,
        leechers: 0,
        size,
        sizeBytes,
        category: 'Anime',
        added,
        provider: 'SubsPlease'
      })
    }
  }
  return results
}

export function parseAniDexFeed(xml: string): TorrentSearchResult[] {
  if (!/<(?:rss|feed)[\s>]/i.test(xml)) return []
  const results: TorrentSearchResult[] = []
  const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi
  let match: RegExpExecArray | null
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1]
    const name = readXmlTag(itemXml, 'title').trim()
    const magnetMatch = itemXml.match(/href=['"](magnet:\?[^'"]+)['"]/i)
      ?? itemXml.match(/url=['"](magnet:\?[^'"]+)['"]/i)
      ?? itemXml.match(/magnet:\?[^\s<'"]+/i)
    const rawMagnet = magnetMatch ? decodeXmlText(magnetMatch[1] ?? magnetMatch[0]) : ''
    const hash = extractInfoHashFromMagnet(rawMagnet)
    if (!name || !hash) continue
    const magnetURI = appendFallbackTrackers(rawMagnet)

    const description = readXmlTag(itemXml, 'description') || readXmlTag(itemXml, 'summary')
    const sizeMatch = description.match(/(?:size|length)\s*:?\s*([\d.]+\s*(?:[KMGT]i?B|bytes?))/i)
      ?? description.match(/([\d.]+\s*(?:[KMGT]i?B))/i)
    const size = sizeMatch?.[1] || '0 B'
    const published = readXmlTag(itemXml, 'pubDate') || readXmlTag(itemXml, 'updated')
    const publishedDate = published ? new Date(published) : null

    results.push({
      id: `anidex-${hash}`,
      name,
      magnetURI,
      seeders: 0,
      leechers: 0,
      size,
      sizeBytes: parseFileSize(size),
      category: 'Anime',
      added: publishedDate && Number.isFinite(publishedDate.getTime())
        ? publishedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : '',
      provider: 'AniDex'
    })
  }
  return results
}

export function parseTorrentsCsvPayload(payload: unknown): TorrentSearchResult[] {
  const root = asRecord(payload)
  if (!Array.isArray(root?.torrents)) throw new Error('Invalid Torrents-CSV response')
  const results: TorrentSearchResult[] = []
  for (const value of root.torrents) {
    const item = asRecord(value)
    if (!item) continue
    const name = asString(item.name).trim()
    const hash = normalizeInfoHash(item.infohash ?? item.info_hash ?? item.hash)
    if (!name || !hash) continue
    const magnetURI = buildMagnetURI(hash, name)
    if (!magnetURI) continue
    const sizeBytes = Math.round(asNumber(item.size_bytes ?? item.size))
    results.push({
      id: `torrentscsv-${asString(item.id) || hash}`,
      name,
      magnetURI,
      seeders: Math.round(asNumber(item.seeders)),
      leechers: Math.round(asNumber(item.leechers)),
      size: formatFileSize(sizeBytes),
      sizeBytes,
      category: asString(item.category) || 'Video',
      added: unixDate(item.created_unix ?? item.created_at),
      provider: 'TorrentsCSV'
    })
  }
  return results
}

export const parseTorrentsCSVPayload = parseTorrentsCsvPayload

