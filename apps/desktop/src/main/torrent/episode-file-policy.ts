export interface PreferredEpisodeFile {
  seasonNumber: number
  episodeNumber: number
}

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

export function findPreferredEpisodeFile(
  files: TorrentFileCandidate[],
  preferred: PreferredEpisodeFile
): EpisodeFileMatch {
  const candidateIndexes = files.flatMap((file, index) => {
    if (!VIDEO_EXTENSIONS.has(extension(file.name))) return []
    const searchablePath = `${file.path ?? ''}/${file.name}`
    const matches = episodeTokens(searchablePath).some((token) => (
      token.season === preferred.seasonNumber && token.episode === preferred.episodeNumber
    ))
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
