type UnknownRecord = Record<string, unknown>

import type { AnimeSearchMetadata } from '../types/torrent'

interface CacheEntry {
  expiresAt: number
  value: AnimeSearchMetadata | null
}

const API_URL = 'https://graphql.anilist.co'
const CACHE_TTL_MS = 24 * 60 * 60_000
const REQUEST_TIMEOUT_MS = 8_000

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : null
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeTitle(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

export function normalizeAnimeSearchMetadata(value: unknown, requestedTitle: string): AnimeSearchMetadata | null {
  const media = asRecord(asRecord(value)?.data)?.Media
  const record = asRecord(media)
  if (!record) return null
  const titles = asRecord(record.title)
  const mediaTitles = [
    titles?.english,
    titles?.romaji,
    titles?.native,
    ...(Array.isArray(record.synonyms) ? record.synonyms : [])
  ].flatMap((title) => (asString(title) ? [asString(title)!] : []))

  const normalizedRequested = normalizeTitle(requestedTitle)
  const isVerified = mediaTitles.some((title) => normalizeTitle(title) === normalizedRequested)
  if (!isVerified) return null

  const rawAliases = [
    titles?.english,
    titles?.romaji,
    titles?.native,
    requestedTitle,
    ...(Array.isArray(record.synonyms) ? record.synonyms : [])
  ]
  const aliases = rawAliases
    .flatMap((title) => (asString(title) ? [asString(title)!] : []))
    .filter((title, index, all) => all.findIndex((candidate) => normalizeTitle(candidate) === normalizeTitle(title)) === index)
    .slice(0, 15)

  if (aliases.length === 0) return null

  const episodes = typeof record.episodes === 'number' && Number.isSafeInteger(record.episodes) && record.episodes > 0
    ? record.episodes
    : null
  return { aliases, episodeCount: episodes }
}

export class AniListClient {
  private readonly fetchImpl: typeof fetch
  private readonly cache = new Map<string, CacheEntry>()

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl
  }

  async getAnimeSearchMetadata(title: string): Promise<AnimeSearchMetadata | null> {
    const cleanTitle = title.replace(/\s*\((?:19|20|21)\d{2}\)/g, '').replace(/\s*\(TV\)/gi, '').trim()
    const key = normalizeTitle(cleanTitle || title)
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > Date.now()) return cached.value

    const response = await this.fetchImpl(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        query: `query ($search: String) { Media(search: $search, type: ANIME) { episodes title { english romaji native } synonyms } }`,
        variables: { search: cleanTitle || title }
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!response.ok) throw new Error(`AniList HTTP ${response.status}`)
    const metadata = normalizeAnimeSearchMetadata(await response.json(), title)
    this.cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: metadata })
    return metadata
  }
}

export const anilistClient = new AniListClient()

