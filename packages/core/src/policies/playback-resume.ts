export interface PlaybackResumeSnapshot {
  progress?: number
  currentTime?: number
  duration?: number
}

const MINIMUM_RESUME_SECONDS = 10
const MINIMUM_REMAINING_SECONDS = 30
const COMPLETED_PROGRESS = 0.95

export function getPlaybackResumeTime(
  snapshot: PlaybackResumeSnapshot | null | undefined,
  mediaDuration: number
): number {
  if (!snapshot || !Number.isFinite(mediaDuration) || mediaDuration <= 0) return 0

  const exactTime = Number.isFinite(snapshot.currentTime) ? snapshot.currentTime ?? 0 : 0
  const progressTime = Number.isFinite(snapshot.progress) ? (snapshot.progress ?? 0) * mediaDuration : 0
  const candidate = exactTime > 0 ? exactTime : progressTime
  const progress = candidate / mediaDuration

  if (candidate < MINIMUM_RESUME_SECONDS) return 0
  if (progress >= COMPLETED_PROGRESS || mediaDuration - candidate < MINIMUM_REMAINING_SECONDS) return 0
  return Math.min(candidate, Math.max(0, mediaDuration - 0.25))
}

export function formatResumeTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}
