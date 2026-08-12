import type { TorrentSearchResult } from './provider-policy'

export interface MovieTorrentSearchRequest {
  title: string
  year?: number
  imdbId?: string
  torznabUrl?: string
  torznabApiKey?: string
}

function normalizeTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function containsTitle(releaseName: string, title: string): boolean {
  const release = normalizeTitle(releaseName)
  const normalizedTitle = normalizeTitle(title)
  if (!normalizedTitle) return false
  if (normalizedTitle.length <= 3) return ` ${release} `.includes(` ${normalizedTitle} `)
  return release.replace(/\s/g, '').includes(normalizedTitle.replace(/\s/g, ''))
}

export function buildMovieSearchQuery(request: MovieTorrentSearchRequest): string {
  return [request.title.trim(), request.year].filter(Boolean).join(' ')
}

export function matchesMovieRelease(
  result: TorrentSearchResult,
  request: MovieTorrentSearchRequest
): boolean {
  if (!containsTitle(result.name, request.title)) return false
  if (/s\d{1,3}[\s._-]*e\d{1,3}|(?:^|[^a-z0-9])\d{1,3}x\d{1,3}(?:$|[^a-z0-9])/i.test(result.name)) {
    return false
  }
  if (!request.year) return true
  if (result.provider === 'YTS' && result.added === String(request.year)) return true
  return new RegExp(`(?:^|[^0-9])${request.year}(?:$|[^0-9])`).test(result.name)
}
