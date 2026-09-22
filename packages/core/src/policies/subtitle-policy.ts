export interface SubtitleCue {
  start: number
  end: number
  text: string
}

function parseTimestamp(timestamp: string): number {
  const cleaned = timestamp.trim().replace(',', '.')
  const parts = cleaned.split(':')
  if (parts.length === 3) {
    return Number.parseFloat(parts[0]) * 3600
      + Number.parseFloat(parts[1]) * 60
      + Number.parseFloat(parts[2])
  }
  if (parts.length === 2) {
    return Number.parseFloat(parts[0]) * 60 + Number.parseFloat(parts[1])
  }
  return Number.parseFloat(cleaned) || 0
}

function cleanText(value: string): string {
  return value
    .replace(/\{[^}]*\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\\[Nn]/g, '\n')
    .replace(/\\h/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim()
}

function parseAssSubtitles(content: string, timeOffset: number): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  let fields = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text']

  for (const rawLine of content.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (/^format\s*:/i.test(line)) {
      fields = line.slice(line.indexOf(':') + 1).split(',').map((field) => field.trim().toLowerCase())
      continue
    }
    if (!/^dialogue\s*:/i.test(line)) continue

    const payload = line.slice(line.indexOf(':') + 1).trim()
    const values: string[] = []
    let remainder = payload
    for (let index = 0; index < fields.length - 1; index++) {
      const comma = remainder.indexOf(',')
      if (comma < 0) break
      values.push(remainder.slice(0, comma).trim())
      remainder = remainder.slice(comma + 1)
    }
    values.push(remainder)

    const startIndex = fields.indexOf('start')
    const endIndex = fields.indexOf('end')
    const textIndex = fields.indexOf('text')
    if (startIndex < 0 || endIndex < 0 || textIndex < 0) continue

    const start = parseTimestamp(values[startIndex] || '') + timeOffset
    const end = parseTimestamp(values[endIndex] || '') + timeOffset
    const text = cleanText(values[textIndex] || '')
    if (text && end >= start) cues.push({ start, end, text })
  }

  return cues
}

export function parseSubtitles(content: string, timeOffset: number = 0): SubtitleCue[] {
  if (/^\s*(?:\[Script Info\]|\[Events\]|Dialogue\s*:)/im.test(content)) {
    return parseAssSubtitles(content, timeOffset)
  }

  const cues: SubtitleCue[] = []
  const blocks = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n\n+/)

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    const timestampIndex = lines.findIndex((line) => line.includes('-->'))
    if (timestampIndex < 0) continue

    const timestamps = lines[timestampIndex].split('-->')
    if (timestamps.length < 2) continue
    const start = parseTimestamp(timestamps[0]) + timeOffset
    const end = parseTimestamp(timestamps[1].trim().split(/\s+/)[0] || timestamps[1]) + timeOffset
    const text = cleanText(lines.slice(timestampIndex + 1).join('\n'))

    if (text && end >= start) cues.push({ start, end, text })
  }

  return cues
}

export function findActiveSubtitleCue(
  cues: SubtitleCue[],
  currentTime: number,
  offset: number
): SubtitleCue | null {
  const subtitleClock = currentTime - offset
  return cues.find((cue) => subtitleClock >= cue.start && subtitleClock <= cue.end) ?? null
}