export function getLocalPlaybackTime(
  absoluteTime: number,
  timelineOffset: number,
  mediaDuration: number
): number {
  if (!Number.isFinite(absoluteTime) || !Number.isFinite(timelineOffset)) return 0

  const localTime = absoluteTime - timelineOffset
  if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) {
    return Math.max(0, localTime)
  }

  return Math.max(0, Math.min(localTime, mediaDuration))
}

/** Translate the full movie timeline without clamping to a transient stream fragment. */
export function getUnclampedLocalSeekTime(absoluteTime: number, timelineOffset: number): number {
  if (!Number.isFinite(absoluteTime) || !Number.isFinite(timelineOffset)) return 0
  return Math.max(0, absoluteTime - timelineOffset)
}
