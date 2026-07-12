import { ArrowDown, ArrowUp, Users } from 'lucide-react'
import { formatBytes, formatSpeed } from '../../lib/utils'

interface BufferIndicatorProps {
  progress: number       // 0–1 overall download progress
  bufferProgress: number // 0–1 buffer ahead of playhead
  downloadSpeed: number  // bytes/sec
  uploadSpeed: number    // bytes/sec
  peers: number
}

export default function BufferIndicator({
  progress,
  bufferProgress,
  downloadSpeed,
  uploadSpeed,
  peers
}: BufferIndicatorProps) {
  const pctDownloaded = Math.min(progress * 100, 100)
  const pctBuffer = Math.min(bufferProgress * 100, 100)

  return (
    <div className="w-full space-y-2">
      {/* Progress Bar */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]">
        {/* Buffered (lighter, behind downloaded) */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-accent)]/20 transition-all duration-500"
          style={{ width: `${pctBuffer}%` }}
        />
        {/* Downloaded */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{
            width: `${pctDownloaded}%`,
            background: `linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))`
          }}
        />
      </div>

      {/* Stats Row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-secondary)]">
        <span className="font-medium text-[var(--color-text-primary)]">
          {pctDownloaded.toFixed(1)}% downloaded
        </span>

        <span className="flex items-center gap-1">
          <ArrowDown className="h-3 w-3 text-[var(--color-success)]" />
          {formatSpeed(downloadSpeed)}
        </span>

        <span className="flex items-center gap-1">
          <ArrowUp className="h-3 w-3 text-[var(--color-accent)]" />
          {formatSpeed(uploadSpeed)}
        </span>

        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {peers} peer{peers !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
