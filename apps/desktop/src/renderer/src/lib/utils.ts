/**
 * StreamForge — Utility Functions
 */

/**
 * Format a byte count into a human-readable string.
 * e.g. 1536 → "1.5 KB", 1073741824 → "1.0 GB"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))
  const idx = Math.min(i, units.length - 1)
  const value = bytes / Math.pow(k, idx)
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}

/**
 * Format a speed in bytes/second to a human-readable string.
 * e.g. 2400000 → "2.3 MB/s"
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return '0 B/s'
  return `${formatBytes(bytesPerSecond)}/s`
}

/**
 * Format seconds to a duration string.
 * e.g. 4980 → "1h 23m", 2700 → "45m", 150 → "2m 30s"
 */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s > 0 ? `${s}s` : ''}`
  return `${s}s`
}

/**
 * Format remaining time in milliseconds to a human-readable estimate.
 * e.g. 300000 → "~5 min", 7200000 → "~2 hours"
 */
export function formatTimeRemaining(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return 'Unknown'
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) return '< 1 min'
  const minutes = Math.round(totalSeconds / 60)
  if (minutes < 60) return `~${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `~${hours} hour${hours > 1 ? 's' : ''}`
  const days = Math.round(hours / 24)
  return `~${days} day${days > 1 ? 's' : ''}`
}

/**
 * Validate that a string is a valid magnet URI.
 */
export function isValidMagnet(uri: string): boolean {
  return uri.trim().startsWith('magnet:?')
}

/**
 * Extract the info hash from a magnet URI.
 * Magnet URIs have the form: magnet:?xt=urn:btih:<infoHash>&...
 */
export function extractInfoHash(magnetURI: string): string | null {
  const match = magnetURI.match(/btih:([a-fA-F0-9]{40})/i)
  return match ? match[1].toLowerCase() : null
}

/**
 * Get the appropriate video MIME type for a given filename.
 */
export function getVideoMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const mimeMap: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogg: 'video/ogg',
    ogv: 'video/ogg',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    m4v: 'video/mp4',
    ts: 'video/mp2t',
    wmv: 'video/x-ms-wmv',
    flv: 'video/x-flv'
  }
  return mimeMap[ext] ?? 'video/mp4'
}
