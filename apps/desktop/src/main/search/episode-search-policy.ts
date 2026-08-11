export interface EpisodeTorrentSearchRequest {
  seriesTitle: string
  seasonNumber: number
  episodeNumber: number
  episodeTitle?: string
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
  return /\b(?:complete season|season complete|season pack|full season|batch)\b/.test(normalized)
    || /(?:s\d{1,3}[\s._-]*e|\d{1,3}x)\d{1,3}[\s._-]*[-~][\s._-]*(?:e)?\d{1,3}/i.test(releaseName)
    || /\bepisodes?[\s._-]*\d{1,3}[\s._-]*[-~][\s._-]*\d{1,3}\b/i.test(releaseName)
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

export function matchesEpisodeRelease(
  releaseName: string,
  request: EpisodeTorrentSearchRequest
): boolean {
  if (!releaseHasExactSeriesTitle(releaseName, request.seriesTitle)) return false
  if (hasPackOrRangeIndicators(releaseName)) return false
  const tokens = standardEpisodeTokens(releaseName)
  return tokens.length === 1
    && tokens[0].season === request.seasonNumber
    && tokens[0].episode === request.episodeNumber
}
