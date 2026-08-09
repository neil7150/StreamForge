const INFO_HASH_RE = /^[a-f0-9]{40}$/i
const BASE32_HASH_RE = /^[a-z2-7]{32}$/i
const MAX_MAGNET_LENGTH = 16_384
const MAX_SEARCH_LENGTH = 200

export function requireInfoHash(value: unknown): string {
  if (typeof value !== 'string' || !INFO_HASH_RE.test(value)) {
    throw new TypeError('Invalid torrent info hash')
  }
  return value.toLowerCase()
}

export function requireMagnetURI(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_MAGNET_LENGTH) {
    throw new TypeError('Invalid magnet URI')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new TypeError('Invalid magnet URI')
  }

  const exactTopic = parsed.searchParams.getAll('xt')
    .find((topic) => topic.toLowerCase().startsWith('urn:btih:'))
  const hash = exactTopic?.slice('urn:btih:'.length) ?? ''

  if (parsed.protocol !== 'magnet:' || (!INFO_HASH_RE.test(hash) && !BASE32_HASH_RE.test(hash))) {
    throw new TypeError('Magnet URI must contain a valid BitTorrent info hash')
  }
  return value
}

export function requireFileIndex(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100_000) {
    throw new TypeError('Invalid torrent file index')
  }
  return value
}

export function requireFiniteNumber(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`Invalid ${name}`)
  }
  return value
}

export function requireSearchQuery(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Invalid search query')
  const query = value.trim()
  if (query.length < 2 || query.length > MAX_SEARCH_LENGTH) {
    throw new TypeError(`Search query must be between 2 and ${MAX_SEARCH_LENGTH} characters`)
  }
  return query
}
