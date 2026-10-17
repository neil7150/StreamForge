import type { TorrentSearchResult } from '../../../preload/index.d'
import type { PlaybackSettings } from '../stores/playbackSettingsStore'

function qualityRank(name: string): number {
  const value = name.toLowerCase()
  if (/2160p|\b4k\b|uhd/.test(value)) return 2160
  if (/1080p|fhd/.test(value)) return 1080
  if (/720p/.test(value)) return 720
  if (/480p|480i|576p|576i/.test(value)) return 480
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

function isCamOrPoorQuality(name: string): boolean {
  // Matches CAM/TS release types as tagged segments (e.g. ".HDTS.", ".CAM.", "-TS-")
  // but NOT ".ts" as a file container extension (MPEG Transport Stream).
  if (/\b(cam|hd-?cam|camrip|telesync|hdts|telecine|screener|scr|dvdscr|r5)\b/i.test(name)) return true
  // Match standalone 'TS' only when surrounded by dots, dashes, spaces (release tag), not at end of string (file ext)
  if (/(?:^|[\s._-])ts(?:[\s._-]|$)(?![\s._-]*$)/i.test(name) && !/\.\bts\b$/i.test(name)) return true
  return false
}

function sizeInGb(source: TorrentSearchResult): number {
  if (Number.isFinite(source.sizeBytes) && source.sizeBytes > 0) return source.sizeBytes / (1024 ** 3)
  const match = source.size.match(/([\d.]+)\s*(tb|gb|mb)/i)
  if (!match) return 0
  const amount = Number.parseFloat(match[1])
  const unit = match[2].toLowerCase()
  return unit === 'tb' ? amount * 1024 : unit === 'mb' ? amount / 1024 : amount
}

function providerReliabilityBoost(provider?: string): number {
  switch (provider) {
    case 'SubsPlease': return 160
    case 'AnimeTosho': return 130
    case 'YTS': return 110
    case 'EZTV': return 100
    case '1337x': return 90
    case 'Nyaa': return 90
    case 'Knaben': return 70
    case 'TorrentsCSV': return 70
    case 'TokyoTosho': return 60
    default: return 30
  }
}

export function sourceScore(source: TorrentSearchResult, settings: PlaybackSettings): number {
  const name = source.name.toLowerCase()
  const target = requestedQuality(settings)
  const actual = qualityRank(source.name)
  const gigabytes = sizeInGb(source)

  // 1. Resolution & Quality Matching (Up to ~500 pts)
  let qualityScore = 0
  if (target === 0) {
    // Auto: 1080p is sweet spot (+420), 4K (+380), 720p (+320), 480p (+100)
    if (actual === 1080) qualityScore = 420
    else if (actual === 2160) qualityScore = 380
    else if (actual === 720) qualityScore = 320
    else if (actual === 480) qualityScore = 100
    else qualityScore = 150
  } else if (actual === target) {
    qualityScore = 500
  } else {
    // Distance penalty
    qualityScore = Math.max(-300, 300 - Math.abs(actual - target) * 0.4)
  }

  // 2. Swarm Health & Seeders (Logarithmic scaling + threshold bonuses)
  const healthyPeerScore = Math.log2(Math.max(0, source.seeders) + 1) * 125
  const highSeederBonus = source.seeders >= 50 ? 100 : source.seeders >= 20 ? 50 : 0
  const lowSeedPenalty = source.seeders < settings.minimumSeeders ? 4_000 : source.seeders === 0 ? 6_000 : 0

  // 3. Release Type & Codec Efficiency
  let releaseBonus = 0
  if (/\b(web[- .]?dl|webrip|bluray|blu-ray|bdrip|brrip)\b/i.test(name)) releaseBonus += 90
  if (/\b(remux)\b/i.test(name)) releaseBonus += 40
  if (/\b(10-?bit|hevc|x265|h\.?265)\b/i.test(name)) releaseBonus += 50
  if (/\b(dual[- .]?audio|multi[- .]?audio|multisubs?|multi[- .]?sub)\b/i.test(name)) releaseBonus += 60

  const camPenalty = isCamOrPoorQuality(source.name) ? 5_000 : 0
  const directPlayScore = settings.preferDirectPlay && isDirectPlay(source.name) ? 220 : 0

  // 4. Size & Bitrate Efficiency for Streaming
  let sizeEfficiency = 0
  if (gigabytes > 0) {
    if (gigabytes >= 0.8 && gigabytes <= 8.0) {
      sizeEfficiency = 100 // Optimal stream size
    } else if (gigabytes > 8.0 && gigabytes <= 16.0) {
      sizeEfficiency = 40
    } else if (gigabytes > 16.0 && gigabytes <= 28.0) {
      sizeEfficiency = -80 // Heavy, requires sustained high bandwidth
    } else if (gigabytes > 28.0) {
      sizeEfficiency = -250 // Very heavy remux, prone to buffering on average broadband
    } else if (gigabytes < 0.25) {
      sizeEfficiency = -300 // Unusually small, often corrupted or low quality
    }
  }

  const oversizedPenalty = settings.maxStreamSizeGb > 0 && gigabytes > settings.maxStreamSizeGb ? 3_000 : 0
  const providerBonus = providerReliabilityBoost(source.provider)

  return Math.round(
    healthyPeerScore +
    highSeederBonus +
    qualityScore +
    directPlayScore +
    releaseBonus +
    sizeEfficiency +
    providerBonus -
    lowSeedPenalty -
    camPenalty -
    oversizedPenalty
  )
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
