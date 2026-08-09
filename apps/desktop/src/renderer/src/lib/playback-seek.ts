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

export interface LocalBufferedRange {
  start: number
  end: number
}

/** Test a full-timeline target against buffered ranges reported for a stream fragment. */
export function isAbsolutePlaybackTimeBuffered(
  absoluteTime: number,
  timelineOffset: number,
  ranges: readonly LocalBufferedRange[],
  toleranceSeconds: number = 0.25
): boolean {
  if (!Number.isFinite(absoluteTime) || !Number.isFinite(timelineOffset)) return false
  // A compatibility fragment contains no media before its absolute start,
  // even when the normal buffered-range edge tolerance would overlap it.
  if (absoluteTime < timelineOffset) return false
  const tolerance = Number.isFinite(toleranceSeconds) ? Math.max(0, toleranceSeconds) : 0

  return ranges.some((range) => {
    if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) return false
    const absoluteStart = timelineOffset + range.start
    const absoluteEnd = timelineOffset + range.end
    return absoluteTime >= absoluteStart - tolerance && absoluteTime <= absoluteEnd + tolerance
  })
}

/** Ignore time updates from the old source while a newer seek is being prepared. */
export function isPlaybackTimeAtRequestedSeek(
  absoluteTime: number,
  requestedTime: number,
  toleranceSeconds: number = 1.5
): boolean {
  if (!Number.isFinite(absoluteTime) || !Number.isFinite(requestedTime)) return false
  const tolerance = Number.isFinite(toleranceSeconds) ? Math.max(0, toleranceSeconds) : 0
  return Math.abs(absoluteTime - requestedTime) <= tolerance
}
