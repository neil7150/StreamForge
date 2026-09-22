import type { PreferredEpisodeFile } from '../types/torrent'

export interface TorrentFileCandidate {
  name: string
  path?: string
}

export interface EpisodeFileMatch {
  status: 'matched' | 'ambiguous' | 'not-found'
  fileIndex: number | null
  candidateIndexes: number[]
}

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi', '.wmv', '.flv', '.ts',
  '.ogv', '.m2ts', '.mts', '.mpg', '.mpeg', '.3gp', '.3g2', '.divx', '.vob',
  '.rmvb', '.rm', '.asf'
])

function extension(value: string): string {
  const match = value.toLowerCase().match(/\.[a-z0-9]+$/)
  return match?.[0] ?? ''
}

function episodeTokens(value: string): Array<{ season: number; episode: number }> {
  const tokens: Array<{ season: number; episode: number }> = []
  const normalized = value.toLowerCase()

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

function normalizeTitle(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

function matchesAbsoluteEpisode(fileName: string, preferred: PreferredEpisodeFile): boolean {
  if (!preferred.absoluteEpisodeNumber || !preferred.seriesTitles?.length) return false
  if (/(?:^|[^0-9])\d{1,4}[\s._-]*[-~][\s._-]*\d{1,4}(?:$|[^0-9])/i.test(fileName)) return false
  const withoutGroups = fileName.replace(/^(?:\s*\[[^\]]+\]\s*)+/, '').replace(/\.[a-z0-9]+$/i, '')
  const normalized = normalizeTitle(withoutGroups)
  return preferred.seriesTitles.some((title) => {
    const normalizedTitle = normalizeTitle(title)
    if (!normalizedTitle || !normalized.startsWith(`${normalizedTitle} `)) return false
    const remainder = normalized.slice(normalizedTitle.length).trim()
    const match = remainder.match(/^(?:(?:e|ep|episode)\s*)?0*(\d{1,4})(?:v\d+)?(?:\s|$)/i)
    return Number(match?.[1]) === preferred.absoluteEpisodeNumber
  })
}

function matchesBareAbsoluteEpisode(fileName: string, preferred: PreferredEpisodeFile): boolean {
  if (!preferred.absoluteEpisodeOnly || !preferred.absoluteEpisodeNumber) return false
  if (/(?:^|[^0-9])\d{1,4}[\s._-]*[-~][\s._-]*\d{1,4}(?:$|[^0-9])/i.test(fileName)) return false
  const withoutGroupOrExtension = fileName
    .replace(/^(?:\s*\[[^\]]+\]\s*)+/, '')
    .replace(/\.[a-z0-9]+$/i, '')
  const normalized = normalizeTitle(withoutGroupOrExtension)
  const match = normalized.match(/^(?:(?:e|ep|episode)\s*)?0*(\d{1,4})(?:v\d+)?(?:\s|$)/i)
  return Number(match?.[1]) === preferred.absoluteEpisodeNumber
}

export function findPreferredEpisodeFile(
  files: TorrentFileCandidate[],
  preferred: PreferredEpisodeFile
): EpisodeFileMatch {
  if (preferred.fileIndex !== undefined) {
    const exactFile = files[preferred.fileIndex]
    if (exactFile && VIDEO_EXTENSIONS.has(extension(exactFile.name))) {
      return { status: 'matched', fileIndex: preferred.fileIndex, candidateIndexes: [preferred.fileIndex] }
    }
  }
  const candidateIndexes = files.flatMap((file, index) => {
    if (!VIDEO_EXTENSIONS.has(extension(file.name))) return []
    const searchablePath = `${file.path ?? ''}/${file.name}`
    const standardMatch = !preferred.absoluteEpisodeOnly && episodeTokens(searchablePath).some((token) => (
      token.season === preferred.seasonNumber && token.episode === preferred.episodeNumber
    ))
    const matches = standardMatch
      || matchesAbsoluteEpisode(file.name, preferred)
      || matchesBareAbsoluteEpisode(file.name, preferred)
    return matches ? [index] : []
  })

  if (candidateIndexes.length === 1) {
    return { status: 'matched', fileIndex: candidateIndexes[0], candidateIndexes }
  }
  if (candidateIndexes.length > 1) {
    return { status: 'ambiguous', fileIndex: null, candidateIndexes }
  }
  return { status: 'not-found', fileIndex: null, candidateIndexes: [] }
}
