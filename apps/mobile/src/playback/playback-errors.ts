export function playbackErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (/timed out waiting for torrent metadata/i.test(message)) {
    return 'This source did not send its file list in time. Try a different source on the previous screen. A listed seeder count does not guarantee reachable peers.'
  }
  if (/at least 1 GB|storage is low|cache unavailable/i.test(message)) return 'Streaming needs more free device storage. Free some space, then retry.'
  if (/Call to function|java\.lang\.|IllegalStateException/i.test(message)) return 'This source could not start playback. Try another source or retry after checking your connection.'
  return message || 'Unable to start playback. Try another source.'
}

/** Each startup phase gets its own budget; metadata must not consume video time. */
export function bufferingTimeoutMessage(phase: 'metadata' | 'video'): string {
  return phase === 'metadata'
    ? 'No file list was received from this source. Go back and choose another source.'
    : 'The selected video is not receiving enough playable data. Try another source or check your connection.'
}

export function isUnregisteredPreparingSession(error: unknown): boolean {
  return error instanceof Error && /\bsession not active\b/i.test(error.message)
}
