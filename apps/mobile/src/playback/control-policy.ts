import type { SessionFile } from './session-manager'

export function seekTarget(x: number, width: number, duration: number): number | null {
  if (![x, width, duration].every(Number.isFinite) || width <= 0 || duration <= 0) return null
  return Math.max(0, Math.min(duration, x / width * duration))
}

const languageAliases: Record<string, string> = { eng: 'en', hin: 'hi', jpn: 'ja', spa: 'es', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de', por: 'pt', ita: 'it', kor: 'ko', zho: 'zh', chi: 'zh' }
export function matchesLanguage(language: string | null | undefined, preferred: string): boolean {
  const normalize = (value: string) => { const base = value.toLowerCase().split(/[-_]/)[0]; return languageAliases[base] || base }
  return Boolean(language && preferred && normalize(language) === normalize(preferred))
}

/** Rank matching sidecars first, but keep manual choice for ambiguous release names. */
export function bundledSubtitles(files: SessionFile[], selectedIndex: number): SessionFile[] {
  const video = files.find(file => file.index === selectedIndex)
  const stem = (path: string) => path.replace(/\\/g, '/').split('/').pop()!.replace(/\.[^.]+$/, '').toLowerCase()
  const videoStem = video ? stem(video.path) : ''
  const episode = videoStem.match(/s\d{1,3}e\d{1,3}/i)?.[0]
  return files.filter(file => /\.(srt|vtt)$/i.test(file.path) && file.size > 0 && file.size <= 2 * 1024 * 1024)
    .filter(file => !episode || !/s\d{1,3}e\d{1,3}/i.test(file.path) || file.path.toLowerCase().includes(episode))
    .sort((a, b) => Number(stem(b.path).startsWith(videoStem)) - Number(stem(a.path).startsWith(videoStem)) || a.path.localeCompare(b.path))
}
