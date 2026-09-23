import { useState } from 'react'
import { Activity, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Clock, Loader2 } from 'lucide-react'
import type { TorrentProviderStatus } from '../../../../preload/index.d'

interface ProviderStatusBarProps {
  providers?: TorrentProviderStatus[]
  loading?: boolean
  className?: string
}

export default function ProviderStatusBar({
  providers = [],
  loading = false,
  className = ''
}: ProviderStatusBarProps) {
  const [expanded, setExpanded] = useState(false)

  if (!loading && (!providers || providers.length === 0)) {
    return null
  }

  const okCount = providers.filter((p) => p.status === 'ok').length
  const cooldownCount = providers.filter((p) => p.status === 'cooldown').length
  const errorCount = providers.filter((p) => p.status === 'error').length
  const totalCount = providers.length

  return (
    <div className={`rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 transition-all ${className}`}>
      <div className="flex items-center justify-between gap-3 text-[10px]">
        <div className="flex items-center gap-2 text-white/50">
          <Activity className="h-3.5 w-3.5 text-teal-300/70" />
          <span className="font-medium text-white/70">
            {loading ? 'Querying providers...' : `Search Providers (${okCount}/${totalCount} active)`}
          </span>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-teal-300" />}
        </div>

        <div className="flex items-center gap-3">
          {!loading && (
            <div className="flex items-center gap-2 text-[9px]">
              {okCount > 0 && (
                <span className="flex items-center gap-1 text-teal-300/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                  {okCount} ok
                </span>
              )}
              {cooldownCount > 0 && (
                <span className="flex items-center gap-1 text-amber-300/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {cooldownCount} paused
                </span>
              )}
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-rose-300/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  {errorCount} unavailable
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-white/40 hover:bg-white/[0.05] hover:text-white/70"
            aria-expanded={expanded}
          >
            {expanded ? 'Hide details' : 'Show details'}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-white/[0.05] pt-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {providers.map((p) => {
            const isCooldown = p.status === 'cooldown'
            const isError = p.status === 'error'

            let statusColor = 'text-teal-300/90 border-teal-500/20 bg-teal-500/[0.04]'
            let icon = <CheckCircle2 className="h-3 w-3 shrink-0 text-teal-400" />
            let label = `${p.count} found`

            if (p.latencyMs && p.latencyMs > 0) {
              label += ` (${p.latencyMs}ms)`
            }

            if (isCooldown) {
              statusColor = 'text-amber-300/90 border-amber-500/20 bg-amber-500/[0.04]'
              icon = <Clock className="h-3 w-3 shrink-0 text-amber-400" />
              label = 'Cooldown (60s)'
            } else if (isError) {
              statusColor = 'text-rose-300/90 border-rose-500/20 bg-rose-500/[0.04]'
              icon = <AlertCircle className="h-3 w-3 shrink-0 text-rose-400" />
              label = p.error ? (p.error.length > 24 ? p.error.slice(0, 24) + '...' : p.error) : 'Failed'
            }

            return (
              <div
                key={p.name}
                title={p.error || `${p.name}: ${p.count} results`}
                className={`flex items-center justify-between gap-1.5 rounded-md border px-2 py-1 text-[9px] ${statusColor}`}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  {icon}
                  <span className="truncate font-medium text-white/80">{p.name}</span>
                </div>
                <span className="shrink-0 text-[8.5px] opacity-75">{label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
