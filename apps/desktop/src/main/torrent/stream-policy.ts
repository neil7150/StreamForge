const MIB = 1024 * 1024

export const RETAINED_BEHIND_SECONDS = 25
export const MIN_AHEAD_SECONDS = 20
export const MAX_AHEAD_SECONDS = 30
export const FALLBACK_STARTUP_BUFFER_BYTES = 10 * MIB

const MIN_STARTUP_BUFFER_BYTES = 4 * MIB
const MAX_STARTUP_BUFFER_BYTES = 32 * MIB
const STARTUP_SECONDS = 8
export const STARTUP_CRITICAL_BYTES = 4 * MIB
export const METADATA_TAIL_BYTES = 2 * MIB

export interface PieceRange {
  start: number
  end: number
}

export interface StreamWindowPolicyInput {
  fileLength: number
  duration: number
  currentTime: number
  downloadSpeed: number
  recentlyStalled?: boolean
}

export interface StreamWindowPolicy {
  startByte: number
  endByte: number
  bytesPerSecond: number
  aheadSeconds: number
  behindSeconds: number
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function calculateAheadSeconds(
  downloadSpeed: number,
  bytesPerSecond: number,
  recentlyStalled = false
): number {
  if (recentlyStalled || bytesPerSecond <= 0 || downloadSpeed <= 0) {
    return MAX_AHEAD_SECONDS
  }

  const headroom = downloadSpeed / bytesPerSecond
  if (headroom >= 2.5) return MIN_AHEAD_SECONDS
  if (headroom >= 1.5) return 25
  return MAX_AHEAD_SECONDS
}

/** Eight seconds is enough to start playback while remaining bounded for 4K files. */
export function calculateStartupBufferBytes(bytesPerSecond?: number): number {
  if (!bytesPerSecond || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return FALLBACK_STARTUP_BUFFER_BYTES
  }
  return Math.round(clamp(
    bytesPerSecond * STARTUP_SECONDS,
    MIN_STARTUP_BUFFER_BYTES,
    MAX_STARTUP_BUFFER_BYTES
  ))
}

/** Limit urgent startup requests by bytes instead of torrent piece count. */
export function calculateStartupCriticalEndPiece(
  startPiece: number,
  selectedEndPiece: number,
  pieceLength: number
): number {
  const safePieceLength = Math.max(1, Math.floor(pieceLength))
  const criticalPieceCount = Math.max(1, Math.ceil(STARTUP_CRITICAL_BYTES / safePieceLength))
  return Math.min(selectedEndPiece, startPiece + criticalPieceCount - 1)
}

/** Select only file-tail pieces that are not covered by the startup window. */
export function calculateMetadataTailPieceRange(
  fileOffset: number,
  fileLength: number,
  pieceLength: number,
  selectedEndPiece?: number
): PieceRange | null {
  if (fileLength <= 0 || pieceLength <= 0) return null
  const tailByte = Math.max(0, fileLength - METADATA_TAIL_BYTES)
  const tailStartPiece = Math.floor((fileOffset + tailByte) / pieceLength)
  const fileEndPiece = Math.floor((fileOffset + fileLength - 1) / pieceLength)
  const start = selectedEndPiece === undefined
    ? tailStartPiece
    : Math.max(tailStartPiece, selectedEndPiece + 1)
  return start <= fileEndPiece ? { start, end: fileEndPiece } : null
}

export function calculateStreamWindow(input: StreamWindowPolicyInput): StreamWindowPolicy {
  const fileLength = Math.max(1, Math.floor(input.fileLength))
  const duration = Math.max(0.001, input.duration)
  const currentTime = clamp(input.currentTime, 0, duration)
  const bytesPerSecond = fileLength / duration
  const aheadSeconds = calculateAheadSeconds(
    input.downloadSpeed,
    bytesPerSecond,
    input.recentlyStalled
  )

  return {
    startByte: Math.floor(Math.max(0, currentTime - RETAINED_BEHIND_SECONDS) * bytesPerSecond),
    endByte: Math.ceil(Math.min(duration, currentTime + aheadSeconds) * bytesPerSecond),
    bytesPerSecond,
    aheadSeconds,
    behindSeconds: RETAINED_BEHIND_SECONDS
  }
}
