import { useNavigate } from 'react-router-dom'
import { Clock, Play, Trash2, RotateCcw } from 'lucide-react'
import { useUserDataStore } from '../stores/userDataStore'

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export default function History() {
  const navigate = useNavigate()
  const history = useUserDataStore((s) => s.history)
  const removeFromHistory = useUserDataStore((s) => s.removeFromHistory)
  const clearHistory = useUserDataStore((s) => s.clearHistory)

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <section className="flex items-center justify-between px-6 pt-6 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">History</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {history.length} item{history.length !== 1 ? 's' : ''} watched
          </p>
        </div>
        {history.length > 0 && (
          <button
            onClick={clearHistory}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Trash2 className="h-3 w-3" /> Clear All
          </button>
        )}
      </section>

      <section className="flex-1 px-6 pb-8">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Clock className="h-12 w-12 text-[var(--color-text-muted)]/30 mb-4" />
            <p className="text-sm text-[var(--color-text-muted)]">No watch history yet</p>
            <p className="text-xs text-[var(--color-text-muted)]/60 mt-1">
              Movies you watch will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <div
                key={entry.movieId}
                onClick={() => navigate(`/movie/${entry.slug}`)}
                className="glass group flex cursor-pointer items-center gap-4 rounded-xl p-3 transition-all duration-200 hover:shadow-[var(--shadow-card-hover)]"
              >
                {/* Poster */}
                <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--color-bg-tertiary)]">
                  <img src={entry.poster} alt={entry.title} className="h-full w-full object-cover" loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  {/* Progress bar */}
                  {entry.progress > 0 && entry.progress < 1 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                      <div className="h-full bg-[var(--color-accent)]" style={{ width: `${entry.progress * 100}%` }} />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors">
                    {entry.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {timeAgo(entry.watchedAt)}
                    </span>
                    {entry.progress > 0 && entry.progress < 1 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-[var(--color-accent)]">
                        <RotateCcw className="h-2.5 w-2.5" />
                        {Math.round(entry.progress * 100)}% watched
                      </span>
                    )}
                    {entry.progress >= 1 && (
                      <span className="text-[10px] text-emerald-400">✓ Completed</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {entry.magnetURI && (
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate('/', { state: { magnetURI: entry.magnetURI } }) }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-all hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)]"
                      title="Play again"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFromHistory(entry.movieId) }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 hover:text-red-400"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
