import type { TorrentSearchResult } from '../../../preload/index.d'
import type { PlaybackSettings } from '../stores/playbackSettingsStore'

function qualityRank(name: string): number {
  const value = name.toLowerCase()
  if (/2160p|\b4k\b/.test(value)) return 2160
  if (/1080p/.test(value)) return 1080
  if (/720p/.test(value)) return 720
  if (/480p/.test(value)) return 480
  return 0
}

function requestedQuality(settings: PlaybackSettings): number {
  if (settings.preferredQuality === 'auto') return 0
  return Number.parseInt(settings.preferredQuality, 10) || 0
}

function isDirectPlay(name: string): boolean {
  const value = name.toLowerCase()
  return /h\.?264|x264|avc/.test(value) && /aac|mp3|opus/.test(value)
}

function sizeInGb(source: TorrentSearchResult): number {
  if (Number.isFinite(source.sizeBytes) && source.sizeBytes > 0) return source.sizeBytes / (1024 ** 3)
  const match = source.size.match(/([\d.]+)\s*(tb|gb|mb)/i)
  if (!match) return 0
  const amount = Number.parseFloat(match[1])
  const unit = match[2].toLowerCase()
  return unit === 'tb' ? amount * 1024 : unit === 'mb' ? amount / 1024 : amount
}

export function sourceScore(source: TorrentSearchResult, settings: PlaybackSettings): number {
  const target = requestedQuality(settings)
  const actual = qualityRank(source.name)
  const qualityScore = target === 0
    ? Math.min(actual, 1080) / 8
    : actual === target ? 500 : -Math.abs(actual - target) / 3
  const directPlayScore = settings.preferDirectPlay && isDirectPlay(source.name) ? 220 : 0
  const healthyPeerScore = Math.log2(Math.max(0, source.seeders) + 1) * 115
  const oversizedPenalty = settings.maxStreamSizeGb > 0 && sizeInGb(source) > settings.maxStreamSizeGb ? 2_000 : 0
  const lowSeedPenalty = source.seeders < settings.minimumSeeders ? 4_000 : 0
  return healthyPeerScore + qualityScore + directPlayScore - oversizedPenalty - lowSeedPenalty
}

export function rankSources(
  sources: TorrentSearchResult[],
  settings: PlaybackSettings
): TorrentSearchResult[] {
  return [...sources].sort((a, b) => {
    const scoreDifference = sourceScore(b, settings) - sourceScore(a, settings)
    return scoreDifference || b.seeders - a.seeders || a.name.localeCompare(b.name)
  })
}

/** Source browsers keep the user's seed-first ordering; Play Best uses rankSources. */
export function sortSourcesBySeeders(sources: TorrentSearchResult[]): TorrentSearchResult[] {
  return [...sources].sort((a, b) => b.seeders - a.seeders || a.name.localeCompare(b.name))
}
