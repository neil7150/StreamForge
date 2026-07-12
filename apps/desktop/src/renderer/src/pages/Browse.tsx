import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, Play, Clock, Calendar, Shield } from 'lucide-react'
import clsx from 'clsx'
import { MOCK_MOVIES, MOCK_GENRES, getMoviesByGenre, type MockMovie } from '../lib/mockData'

export default function Browse() {
  const navigate = useNavigate()
  const [activeGenre, setActiveGenre] = useState('all')
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const movies = useMemo(() => getMoviesByGenre(activeGenre), [activeGenre])

  const handlePlay = useCallback((movie: MockMovie) => {
    if (movie.magnetURI) {
      navigate('/', { state: { magnetURI: movie.magnetURI } })
    }
  }, [navigate])

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ── Hero Banner ─────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pt-6 pb-8">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: 'radial-gradient(ellipse at 30% 20%, oklch(0.65 0.25 275 / 0.3) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, oklch(0.65 0.2 330 / 0.15) 0%, transparent 50%)'
          }}
        />
        <div className="relative">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">Browse</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Explore legal, public domain films ready to stream instantly
          </p>
        </div>
      </section>

      {/* ── Genre Tabs ──────────────────────────────────── */}
      <div className="flex gap-2 px-6 pb-5 overflow-x-auto scrollbar-none">
        {MOCK_GENRES.map((genre) => (
          <button
            key={genre.id}
            onClick={() => setActiveGenre(genre.slug)}
            className={clsx(
              'shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-200',
              activeGenre === genre.slug
                ? 'bg-[var(--color-accent)] text-white shadow-[var(--shadow-glow)]'
                : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)]'
            )}
          >
            {genre.name}
          </button>
        ))}
      </div>

      {/* ── Featured (first movie) ──────────────────────── */}
      {movies.length > 0 && activeGenre === 'all' && (
        <section className="px-6 pb-6">
          <div
            className="glass group relative flex h-52 cursor-pointer items-end overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:shadow-[var(--shadow-card-hover)]"
            onClick={() => navigate(`/movie/${movies[0].slug}`)}
            style={{
              backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%), url(${movies[0].poster})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            <div className="relative z-10 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  Featured
                </span>
                <span className="flex items-center gap-1 text-xs text-yellow-400">
                  <Star className="h-3 w-3 fill-current" />
                  {movies[0].rating}
                </span>
                <span className="text-xs text-white/50">{movies[0].year}</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">{movies[0].title}</h2>
              <p className="text-xs text-white/60 line-clamp-2 max-w-lg">{movies[0].overview}</p>
            </div>
            {movies[0].magnetURI && (
              <button
                onClick={(e) => { e.stopPropagation(); handlePlay(movies[0]) }}
                className="relative z-10 ml-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-lg transition-transform duration-200 hover:scale-110 active:scale-95"
              >
                <Play className="h-5 w-5 fill-current" />
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Movie Grid ──────────────────────────────────── */}
      <section className="px-6 pb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          {activeGenre === 'all' ? 'All Movies' : MOCK_GENRES.find(g => g.slug === activeGenre)?.name}
          <span className="ml-2 text-[var(--color-text-muted)]/50">({movies.length})</span>
        </h2>

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {movies.map((movie) => (
            <div
              key={movie.id}
              className="group relative cursor-pointer"
              onClick={() => navigate(`/movie/${movie.slug}`)}
              onMouseEnter={() => setHoveredId(movie.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Poster */}
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[var(--color-bg-tertiary)] mb-2.5 transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-[var(--shadow-glow)] group-hover:ring-1 group-hover:ring-[var(--color-accent)]/50">
                <img
                  src={movie.poster}
                  alt={movie.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />

                {/* Hover overlay */}
                <div className={clsx(
                  'absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--color-bg-primary)]/80 backdrop-blur-[2px] transition-all duration-300',
                  hoveredId === movie.id ? 'opacity-100' : 'opacity-0'
                )}>
                  {movie.magnetURI ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePlay(movie) }}
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-[var(--shadow-glow)] transition-transform hover:scale-110"
                    >
                      <Play className="h-6 w-6 fill-current ml-0.5" />
                    </button>
                  ) : (
                    <div className="text-center px-4">
                      <p className="text-xs font-medium text-white/80">No stream available</p>
                    </div>
                  )}
                  <p className="text-[10px] uppercase tracking-wider text-white/50 font-semibold mt-2 transition-transform duration-300 transform group-hover:translate-y-0 translate-y-2">Click for details</p>
                </div>

                {/* Rating badge */}
                <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
                  <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                  <span className="text-[10px] font-semibold text-white">{movie.rating}</span>
                </div>

                {/* License badge */}
                <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-emerald-500/20 px-1.5 py-0.5 backdrop-blur-sm">
                  <Shield className="h-2.5 w-2.5 text-emerald-400" />
                  <span className="text-[10px] text-emerald-300">{movie.license}</span>
                </div>
              </div>

              {/* Title + Meta */}
              <h3 className="text-sm font-medium text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors">
                {movie.title}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                  <Calendar className="h-2.5 w-2.5" />
                  {movie.year}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                  <Clock className="h-2.5 w-2.5" />
                  {movie.runtime}
                </span>
              </div>
              <div className="flex gap-1 mt-1">
                {movie.genre.slice(0, 2).map((g) => (
                  <span key={g} className="rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-muted)]">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
