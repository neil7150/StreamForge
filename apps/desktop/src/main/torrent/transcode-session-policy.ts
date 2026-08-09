export interface TranscodeRequestIdentity {
  sessionId: string
  requestId: number
}

export type TranscodeRequestDecision = 'start' | 'replace' | 'duplicate' | 'stale'

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
