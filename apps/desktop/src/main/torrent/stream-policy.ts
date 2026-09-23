const MIB = 1024 * 1024

export const FALLBACK_STARTUP_BUFFER_BYTES = 16 * MIB

const MIN_STARTUP_BUFFER_BYTES = 4 * MIB
const MAX_STARTUP_BUFFER_BYTES = 64 * MIB
const FAST_SPEED_THRESHOLD_BYTES = 4 * MIB // > 4 MB/s (approx 35-40 Mbps)
const LOW_SPEED_THRESHOLD_BYTES = 1 * MIB // < 1 MB/s

export const STARTUP_CRITICAL_BYTES = 8 * MIB
export const METADATA_TAIL_BYTES = 2 * MIB
export const DEFAULT_LOOKAHEAD_SECONDS = 30

export interface PieceRange {
  start: number
  end: number
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/** Select every piece intersecting the chosen video so seeking can reuse it. */
export function calculateFullFilePieceRange(
  fileOffset: number,
  fileLength: number,
  pieceLength: number
): PieceRange | null {
  if (fileOffset < 0 || fileLength <= 0 || pieceLength <= 0) return null
  return {
    start: Math.floor(fileOffset / pieceLength),
    end: Math.floor((fileOffset + fileLength - 1) / pieceLength)
  }
}

/**
 * Adaptive startup buffer:
 * - When real-time download speed is high (> 4 MB/s), startup window drops to 4MB for instant playback start.
 * - When download speed is normal (1-4 MB/s), startup buffer scales with video bitrate (8-16MB).
 * - When download speed is slow (< 1 MB/s), startup buffer increases up to 32MB to prevent immediate stuttering.
 */
export function calculateAdaptiveStartupBufferBytes(
  downloadSpeed: number = 0,
  mediaBytesPerSecond?: number
): number {
  if (downloadSpeed >= FAST_SPEED_THRESHOLD_BYTES) {
    // Fast swarm: minimal safety buffer needed for instantaneous startup
    const target = mediaBytesPerSecond && mediaBytesPerSecond > 0 ? mediaBytesPerSecond * 4 : 4 * MIB
    return Math.round(clamp(target, MIN_STARTUP_BUFFER_BYTES, 12 * MIB))
  }

  if (downloadSpeed > 0 && downloadSpeed < LOW_SPEED_THRESHOLD_BYTES) {
    // Slow swarm: build a deeper reserve to prevent buffering within seconds of start
    const target = mediaBytesPerSecond && mediaBytesPerSecond > 0 ? mediaBytesPerSecond * 25 : 24 * MIB
    return Math.round(clamp(target, 12 * MIB, MAX_STARTUP_BUFFER_BYTES))
  }

  // Balanced default
  if (mediaBytesPerSecond && Number.isFinite(mediaBytesPerSecond) && mediaBytesPerSecond > 0) {
    return Math.round(clamp(mediaBytesPerSecond * 15, 8 * MIB, MAX_STARTUP_BUFFER_BYTES))
  }

  return FALLBACK_STARTUP_BUFFER_BYTES
}

/** Legacy signature fallback wrapper */
export function calculateStartupBufferBytes(bytesPerSecond?: number): number {
  return calculateAdaptiveStartupBufferBytes(0, bytesPerSecond)
}

/** Limit urgent startup requests by bytes instead of torrent piece count. */
export function calculateStartupCriticalEndPiece(
  startPiece: number,
  selectedEndPiece: number,
  pieceLength: number,
  criticalBytes: number = STARTUP_CRITICAL_BYTES
): number {
  const safePieceLength = Math.max(1, Math.floor(pieceLength))
  const criticalPieceCount = Math.max(1, Math.ceil(criticalBytes / safePieceLength))
  return Math.min(selectedEndPiece, startPiece + criticalPieceCount - 1)
}

/**
 * Calculates a lookahead piece range ahead of the current playhead byte.
 * Allows WebTorrent to aggressively prefetch the next 30-45 seconds of video.
 */
export function calculateStreamingLookaheadPieceRange(
  fileOffset: number,
  fileLength: number,
  pieceLength: number,
  currentByte: number,
  bytesPerSecond?: number,
  lookaheadSeconds: number = DEFAULT_LOOKAHEAD_SECONDS
): PieceRange | null {
  if (fileLength <= 0 || pieceLength <= 0 || currentByte < 0) return null

  const safeRate = bytesPerSecond && bytesPerSecond > 0 ? bytesPerSecond : (fileLength / 5400) // assume 90 min video fallback
  const lookaheadBytes = Math.max(16 * MIB, Math.round(safeRate * lookaheadSeconds))
  const startByte = Math.max(0, Math.min(fileLength - 1, currentByte))
  const endByte = Math.min(fileLength - 1, startByte + lookaheadBytes)

  const start = Math.floor((fileOffset + startByte) / pieceLength)
  const end = Math.floor((fileOffset + endByte) / pieceLength)
  return { start, end }
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
