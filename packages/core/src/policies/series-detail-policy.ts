import type { EpisodeSummary, SeasonSummary } from '../types/torrent'

export function parseSeriesId(value: string | undefined): string | number | null {
  if (!value) return null
  if (/^\d+$/.test(value)) {
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null
  }
  // Allow UUIDs from backend API
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return value.toLowerCase()
  }
  return null
}

export function formatCatalogDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(date)
}

export function seasonLabel(season: SeasonSummary): string {
  if (season.absoluteEpisodeStart !== undefined) {
    return season.absoluteEpisodeEnd === undefined
      ? `Episodes ${season.absoluteEpisodeStart}+`
      : `Episodes ${season.absoluteEpisodeStart}–${season.absoluteEpisodeEnd}`
  }
  if (season.number === 0) return season.name || 'Specials'
  return season.name || `Season ${season.number}`
}

export function episodeCode(episode: EpisodeSummary, absoluteNumber?: number): string {
  if (absoluteNumber !== undefined) return `EP ${String(absoluteNumber).padStart(3, '0')}`
  if (episode.episodeNumber === null) {
    return episode.seasonNumber === 0
      ? 'Special'
      : `S${String(episode.seasonNumber).padStart(2, '0')}`
  }
  return `S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}`
}

export function isUpcomingEpisode(episode: EpisodeSummary, now = Date.now()): boolean {
  if (!episode.airDate) return false
  const airDate = Date.parse(`${episode.airDate}T23:59:59Z`)
  return Number.isFinite(airDate) && airDate > now
}

export function absoluteEpisodeNumber(
  seasons: Array<{
    number: number
    episodeCount: number | null
    absoluteEpisodeStart?: number
  }>,
  seasonNumber: number,
  episodeNumber: number
): number | undefined {
  if (seasonNumber <= 0 || episodeNumber <= 0 || !seasons.some((season) => season.number === seasonNumber)) return undefined
  const selectedSeason = seasons.find((season) => season.number === seasonNumber)
  if (selectedSeason?.absoluteEpisodeStart !== undefined) {
    return selectedSeason.absoluteEpisodeStart + episodeNumber - 1
  }
  const preceding = seasons.filter((season) => season.number > 0 && season.number < seasonNumber)
  if (preceding.some((season) => season.episodeCount === null)) return undefined
  return preceding.reduce((total, season) => total + (season.episodeCount ?? 0), episodeNumber)
}

export function usesAbsoluteEpisodeNumbering(seasons: SeasonSummary[]): boolean {
  const regular = seasons.filter((season) => season.number > 0)
  return regular.length > 0 && regular.every((season) => (
    season.absoluteEpisodeStart !== undefined
  ))
}
