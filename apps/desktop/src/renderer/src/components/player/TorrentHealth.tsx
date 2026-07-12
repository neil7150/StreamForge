import { ArrowDownToLine, ArrowUpFromLine, Users, Gauge } from 'lucide-react'
import clsx from 'clsx'
import { formatSpeed } from '../../lib/utils'

interface TorrentHealthProps {
  numPeers: number
  downloadSpeed: number
  uploadSpeed: number
  progress: number // 0–1
  ratio: number
}

function getHealthLevel(peers: number): 'good' | 'fair' | 'poor' {
  if (peers >= 10) return 'good'
  if (peers >= 3) return 'fair'
  return 'poor'
}

const healthConfig = {
  good: {
    color: 'var(--color-health-good)',
    label: 'Healthy',
    dotClass: 'bg-[var(--color-health-good)]'
  },
  fair: {
    color: 'var(--color-health-fair)',
    label: 'Fair',
    dotClass: 'bg-[var(--color-health-fair)]'
  },
  poor: {
    color: 'var(--color-health-poor)',
    label: 'Poor',
    dotClass: 'bg-[var(--color-health-poor)]'
  }
}

export default function TorrentHealth({
  numPeers,
  downloadSpeed,
  uploadSpeed,
  progress,
  ratio
}: TorrentHealthProps) {
  const health = getHealthLevel(numPeers)
  const config = healthConfig[health]
  const pct = Math.min(progress * 100, 100)

  return (
    <div className="glass flex flex-wrap items-center gap-4 rounded-xl px-4 py-3">
      {/* Health Dot */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span
            className={clsx(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-40',
              config.dotClass
            )}
          />
          <span
            className={clsx(
              'relative inline-flex h-2.5 w-2.5 rounded-full',
              config.dotClass
            )}
          />
        </span>
        <span className="text-xs font-medium" style={{ color: config.color }}>
          {config.label}
        </span>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-[var(--color-border)]" />

      {/* Download Speed */}
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
        <ArrowDownToLine className="h-3.5 w-3.5 text-[var(--color-success)]" />
        <span>{formatSpeed(downloadSpeed)}</span>
      </div>

      {/* Upload Speed */}
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
        <ArrowUpFromLine className="h-3.5 w-3.5 text-[var(--color-accent)]" />
        <span>{formatSpeed(uploadSpeed)}</span>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-[var(--color-border)]" />

      {/* Peers */}
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
        <Users className="h-3.5 w-3.5" />
        <span>{numPeers} peer{numPeers !== 1 ? 's' : ''}</span>
      </div>

      {/* Ratio */}
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
        <Gauge className="h-3.5 w-3.5" />
        <span>Ratio: {ratio.toFixed(2)}</span>
      </div>

      {/* Mini progress circle */}
      <div className="ml-auto flex items-center gap-2">
        <svg className="h-7 w-7 -rotate-90" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke="var(--color-bg-tertiary)"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${pct * 0.88} 88`}
            className="transition-all duration-700"
          />
        </svg>
        <span className="text-xs font-medium text-[var(--color-text-primary)]">
          {pct.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}
