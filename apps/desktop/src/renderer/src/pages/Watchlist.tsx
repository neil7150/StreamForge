import { useNavigate } from 'react-router-dom'
import { Bookmark, Play, Trash2, Star, Calendar } from 'lucide-react'
import { useUserDataStore } from '../stores/userDataStore'

export default function Watchlist() {
  const navigate = useNavigate()
  const watchlist = useUserDataStore((s) => s.watchlist)
  const removeFromWatchlist = useUserDataStore((s) => s.removeFromWatchlist)

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <section className="px-6 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">Watchlist</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {watchlist.length} movie{watchlist.length !== 1 ? 's' : ''} saved
        </p>
      </section>

      <section className="flex-1 px-6 pb-8">
        {watchlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Bookmark className="h-12 w-12 text-[var(--color-text-muted)]/30 mb-4" />
            <p className="text-sm text-[var(--color-text-muted)]">Your watchlist is empty</p>
            <p className="text-xs text-[var(--color-text-muted)]/60 mt-1">
              Browse movies and add them to your watchlist
            </p>
            <button
              onClick={() => navigate('/browse')}
              className="mt-4 rounded-lg bg-[var(--color-accent)]/10 px-4 py-2 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors"
            >
              Browse Movies
            </button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {watchlist.map((entry) => (
              <div key={entry.movieId} className="group relative cursor-pointer" onClick={() => navigate(`/movie/${entry.slug}`)}>
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[var(--color-bg-tertiary)] mb-2.5 transition-transform duration-300 group-hover:scale-[1.03]">
                  <img src={entry.poster} alt={entry.title} className="h-full w-full object-cover" loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />

                  {/* Hover overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {entry.magnetURI && (
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate('/', { state: { magnetURI: entry.magnetURI } }) }}
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-lg hover:scale-110 transition-transform"
                      >
                        <Play className="h-5 w-5 fill-current" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFromWatchlist(entry.movieId) }}
                      className="flex items-center gap-1 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/30 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  </div>

                  <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
                    <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                    <span className="text-[10px] font-semibold text-white">{entry.rating}</span>
                  </div>
                </div>

                <h3 className="text-sm font-medium text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors">
                  {entry.title}
                </h3>
                <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                  <Calendar className="h-2.5 w-2.5" />{entry.year}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
