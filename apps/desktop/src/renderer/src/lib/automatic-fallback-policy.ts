export function shouldAutomaticallyFallback(options: {
  enabled: boolean
  playbackStarted: boolean
  currentSourceIndex: number
  sourceCount: number
  alreadyAttempted: boolean
}): boolean {
  return options.enabled
    && !options.playbackStarted
    && !options.alreadyAttempted
    && options.currentSourceIndex >= 0
    && options.currentSourceIndex + 1 < options.sourceCount
}
