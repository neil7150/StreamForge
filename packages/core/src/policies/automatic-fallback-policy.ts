export interface FallbackEvaluationOptions {
  enabled: boolean
  playbackStarted: boolean
  currentSourceIndex: number
  sourceCount: number
  alreadyAttempted: boolean
  isStalled?: boolean
  consecutiveStallSeconds?: number
}

export function shouldAutomaticallyFallback(options: FallbackEvaluationOptions): boolean {
  if (!options.enabled || options.alreadyAttempted) return false
  if (options.currentSourceIndex < 0 || options.currentSourceIndex + 1 >= options.sourceCount) return false

  // 1. Initial startup failure (metadata timeout, connection failure, dead swarm)
  if (!options.playbackStarted) return true

  // 2. Mid-stream fatal stall (swarm died or disconnected, stalled for 12+ consecutive seconds)
  if (options.isStalled && (options.consecutiveStallSeconds ?? 0) >= 12) {
    return true
  }

  return false
}
