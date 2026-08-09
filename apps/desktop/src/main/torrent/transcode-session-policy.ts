export interface TranscodeRequestIdentity {
  sessionId: string
  requestId: number
}

export type TranscodeRequestDecision = 'start' | 'replace' | 'duplicate' | 'stale'

export function parseTranscodeRequestIdentity(
  requestURL: string,
  baseURL: string
): TranscodeRequestIdentity {
  try {
    const url = new URL(requestURL, baseURL)
    const rawSessionId = url.searchParams.get('session') || 'legacy'
    const sessionId = /^[a-zA-Z0-9_-]{1,80}$/.test(rawSessionId) ? rawSessionId : 'legacy'
    const rawRequestId = Number.parseInt(url.searchParams.get('request') || '0', 10)
    const requestId = Number.isSafeInteger(rawRequestId) && rawRequestId >= 0 ? rawRequestId : 0
    return { sessionId, requestId }
  } catch {
    return { sessionId: 'legacy', requestId: 0 }
  }
}

export function isSameTranscodeRequest(
  active: TranscodeRequestIdentity | null,
  candidate: TranscodeRequestIdentity
): boolean {
  return active?.sessionId === candidate.sessionId && active.requestId === candidate.requestId
}

export function classifyTranscodeRequest(
  existing: TranscodeRequestIdentity | null,
  incoming: TranscodeRequestIdentity
): TranscodeRequestDecision {
  if (!existing) return 'start'
  if (existing.sessionId !== incoming.sessionId) return 'replace'
  if (incoming.requestId < existing.requestId) return 'stale'
  if (incoming.requestId === existing.requestId) return 'duplicate'
  return 'replace'
}
