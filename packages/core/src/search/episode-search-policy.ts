import type { EpisodeTorrentSearchRequest } from '../types/torrent'
export type { EpisodeTorrentSearchRequest }

function normalizeTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function episodeMarkerIndex(releaseName: string): number {
  const markers = [
    /s\d{1,3}[\s._-]*e\d{1,3}/i.exec(releaseName),
    /(?:^|[^a-z0-9])\d{1,3}x\d{1,3}(?=$|[^a-z0-9])/i.exec(releaseName)
  ].filter((match): match is RegExpExecArray => match !== null)
  return markers.length > 0 ? Math.min(...markers.map((match) => match.index)) : -1
}

function releaseHasExactSeriesTitle(releaseName: string, seriesTitle: string): boolean {
  const markerIndex = episodeMarkerIndex(releaseName)
  if (markerIndex < 0) return false

  const rawPrefix = releaseName.slice(0, markerIndex)
    .replace(/^(?:\s*\[[^\]]+\]\s*)+/, '')
    .replace(/^(?:www\.)?[a-z0-9.-]+\.(?:com|net|org)\s*[-_. ]+/i, '')
  const releaseTitle = normalizeTitle(rawPrefix).replace(/\s+(?:18|19|20|21)\d{2}$/, '')
  const expectedTitle = normalizeTitle(seriesTitle)
  if (!releaseTitle || !expectedTitle) return false

  return releaseTitle === expectedTitle
    || releaseTitle.replace(/\s/g, '') === expectedTitle.replace(/\s/g, '')
}

function hasPackOrRangeIndicators(releaseName: string): boolean {
  const normalized = normalizeTitle(releaseName)
  return /\b(?:complete season|season complete|season pack|full season|complete series|full series|complete collection|collection|batch)\b/.test(normalized)
    || /(?:s\d{1,3}[\s._-]*e|\d{1,3}x)\d{1,3}[\s._-]*[-~][\s._-]*(?:e)?\d{1,3}/i.test(releaseName)
    || /\bepisodes?[\s._-]*\d{1,3}[\s._-]*[-~][\s._-]*\d{1,3}\b/i.test(releaseName)
    || /(?:^|[^0-9])\d{1,4}[\s._-]*[-~][\s._-]*\d{1,4}(?:$|[^0-9])/i.test(releaseName)
}

function standardEpisodeTokens(releaseName: string): Array<{ season: number; episode: number }> {
  const tokens: Array<{ season: number; episode: number }> = []
  const normalized = releaseName.toLowerCase()

  const sxePattern = /s(\d{1,3})((?:[\s._-]*e\d{1,3})+)/gi
  let sxeMatch: RegExpExecArray | null
  while ((sxeMatch = sxePattern.exec(normalized)) !== null) {
    const season = Number(sxeMatch[1])
    const episodePattern = /e(\d{1,3})/gi
    let episodeMatch: RegExpExecArray | null
    while ((episodeMatch = episodePattern.exec(sxeMatch[2])) !== null) {
      tokens.push({ season, episode: Number(episodeMatch[1]) })
    }
  }

  const alternatePattern = /(?:^|[^a-z0-9])(\d{1,3})x(\d{1,3})(?=$|[^a-z0-9])/gi
  let alternateMatch: RegExpExecArray | null
  while ((alternateMatch = alternatePattern.exec(normalized)) !== null) {
    tokens.push({ season: Number(alternateMatch[1]), episode: Number(alternateMatch[2]) })
  }

  return tokens
}

export function buildEpisodeSearchQuery(request: EpisodeTorrentSearchRequest): string {
  const season = String(request.seasonNumber).padStart(2, '0')
  const episode = String(request.episodeNumber).padStart(2, '0')
  return `${request.seriesTitle.trim()} S${season}E${episode}`
}

export function buildAnimeAbsoluteSearchQueries(request: EpisodeTorrentSearchRequest): string[] {
  const epNum = request.absoluteEpisodeNumber ?? request.episodeNumber
  if (!epNum || epNum <= 0) return []
  const ep2 = String(epNum).padStart(2, '0')
  const titles = [request.seriesTitle, ...(request.seriesAliases ?? [])]
  const seen = new Set<string>()
  const queries: string[] = []
  for (const title of titles) {
    const clean = title.replace(/\s*\((?:19|20|21)\d{2}\)/g, '').replace(/\s*\(TV\)/gi, '').trim()
    const key = normalizeTitle(clean)
    if (!clean || !key || seen.has(key)) continue
    seen.add(key)
    queries.push(`${clean} ${ep2}`)
    if (queries.length >= 8) break
  }
  return queries.slice(0, 8)
}

export function buildAnimeBatchSearchQueries(request: EpisodeTorrentSearchRequest): string[] {
  const titles = [request.seriesTitle, ...(request.seriesAliases ?? [])]
  const seen = new Set<string>()
  const queries: string[] = []
  for (const title of titles) {
    const clean = title.replace(/\s*\((?:19|20|21)\d{2}\)/g, '').replace(/\s*\(TV\)/gi, '').trim()
    const key = normalizeTitle(clean)
    if (!clean || !key || seen.has(key)) continue
    seen.add(key)
    queries.push(`${clean} batch`, `${clean} complete`)
    if (queries.length >= 6) break
  }
  return queries.slice(0, 6)
}

function normalizeRemainderText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\-~]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizedRemainderAfterTitle(releaseName: string, title: string): string | null {
  const withoutGroup = releaseName
    .replace(/^(?:\s*\[[^\]]+\]|\([^)]{1,40}\)\s*)+/, '')
    .replace(/^(?:www\.)?[a-z0-9.-]+\.(?:com|net|org)\s*[-_. ]+/i, '')
  const normalizedRelease = normalizeRemainderText(withoutGroup)
  const cleanTitle = title.replace(/\s*\((?:19|20|21)\d{2}\)/g, '').replace(/\s*\(TV\)/gi, '').trim()
  const normalizedTitle = normalizeTitle(cleanTitle || title)
  if (!normalizedTitle) return null
  if (normalizedRelease.startsWith(`${normalizedTitle} `)) {
    return normalizedRelease.slice(normalizedTitle.length).trim()
  }
  if (normalizedRelease.startsWith(normalizedTitle)) {
    return normalizedRelease.slice(normalizedTitle.length).trim()
  }
  return null
}

function matchesAnimeBatch(releaseName: string, request: EpisodeTorrentSearchRequest): boolean {
  const target = request.absoluteEpisodeNumber ?? (request.seasonNumber === 1 ? request.episodeNumber : undefined)
  if (!target || !hasPackOrRangeIndicators(releaseName)) return false
  const titles = [request.seriesTitle, ...(request.seriesAliases ?? [])]
  return titles.some((title) => {
    const remainder = normalizedRemainderAfterTitle(releaseName, title)
    if (!remainder) return false
    const withoutYear = remainder
      .replace(/^(?:19|20)\d{2}\s+(?:(?:19|20)\d{2}\s+)?/, '')
      .replace(/^anime\s+/, '')
    if (!/^(?:(?:episodes?|eps?|ep)\s*)?\d|^(?:complete|full\s+series|batch|collection|s\d+)(?:\s|$)/.test(withoutYear)) {
      return false
    }
    const ranges = [...withoutYear.matchAll(/(?:(?:episodes?|eps?|ep)\s*)?0*(\d{1,4})\s*(?:to|[-~])\s*0*(\d{1,4})(?:\s|$)/g)]
      .map((match) => ({ start: Number(match[1]), end: Number(match[2]) }))
      .filter((range) => range.start > 0 && range.end >= range.start)
    if (ranges.length > 0) return ranges.some((range) => target >= range.start && target <= range.end)
    return /^(?:complete(?:\s+(?:series|collection))?|full\s+series|batch|collection)(?:\s|$)/.test(withoutYear)
  })
}

function matchesAbsoluteEpisode(releaseName: string, request: EpisodeTorrentSearchRequest): boolean {
  if (!request.absoluteEpisodeOnly && standardEpisodeTokens(releaseName).length > 0) {
    return false
  }
  const target = request.absoluteEpisodeNumber ?? (request.seasonNumber === 1 ? request.episodeNumber : undefined)
  if (!target || hasPackOrRangeIndicators(releaseName)) return false
  const titles = [request.seriesTitle, ...(request.seriesAliases ?? [])]
  return titles.some((title) => {
    const remainder = normalizedRemainderAfterTitle(releaseName, title)
    if (remainder === null) return false
    const match = remainder.match(/^(?:(?:e|ep|episode)\s*|\s*-\s*|\s*)0*(\d{1,4})(?:v\d+)?(?:\s|\(|$)/i)
    return Number(match?.[1]) === target
  })
}

export function matchesEpisodeRelease(
  releaseName: string,
  request: EpisodeTorrentSearchRequest
): boolean {
  const absoluteMatch = matchesAbsoluteEpisode(releaseName, request)
  const batchMatch = matchesAnimeBatch(releaseName, request)
  if (request.absoluteEpisodeOnly) return absoluteMatch || batchMatch
  if (absoluteMatch) return true
  if (batchMatch) return true
  const titles = [request.seriesTitle, ...(request.seriesAliases ?? [])]
  if (!titles.some((title) => releaseHasExactSeriesTitle(releaseName, title))) return false
  if (hasPackOrRangeIndicators(releaseName)) return false
  const tokens = standardEpisodeTokens(releaseName)
  return tokens.length === 1
    && tokens[0].season === request.seasonNumber
    && tokens[0].episode === request.episodeNumber
}
