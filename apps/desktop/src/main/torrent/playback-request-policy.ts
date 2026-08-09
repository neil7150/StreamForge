export function isTimelineSeekRequest(requestURL: string, baseURL: string): boolean {
  try {
    return new URL(requestURL, baseURL).searchParams.has('start')
  } catch {
    return false
  }
}

export function getRequestedAudioTrackIndex(requestURL: string, baseURL: string): number | null {
  try {
    const rawIndex = new URL(requestURL, baseURL).searchParams.get('audio')
    if (rawIndex === null || !/^\d+$/.test(rawIndex)) return null
    const index = Number.parseInt(rawIndex, 10)
    return Number.isSafeInteger(index) ? index : null
  } catch {
    return null
  }
}

export function requiresTimestampMediaPipeline(requestURL: string, baseURL: string): boolean {
  return isTimelineSeekRequest(requestURL, baseURL)
    || getRequestedAudioTrackIndex(requestURL, baseURL) !== null
}