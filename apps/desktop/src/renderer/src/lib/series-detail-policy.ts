import type { EpisodeSummary, SeasonSummary } from '../../../preload/index.d'

export function parseSeriesId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null
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
  if (season.number === 0) return season.name || 'Specials'
  return season.name || `Season ${season.number}`
}

export function episodeCode(episode: EpisodeSummary): string {
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
