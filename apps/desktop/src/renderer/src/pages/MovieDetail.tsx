import { useMemo, useCallback, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Star, Clock, Calendar, Shield, Tag, Bookmark, Download } from 'lucide-react'
import clsx from 'clsx'
import { getMovieBySlug } from '../lib/mockData'
import { useUserDataStore } from '../stores/userDataStore'
import { useTorrentStore } from '../stores/torrentStore'

export default function MovieDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const movie = useMemo(() => (slug ? getMovieBySlug(slug) : undefined), [slug])
  const addToWatchlist = useUserDataStore((s) => s.addToWatchlist)
  const removeFromWatchlist = useUserDataStore((s) => s.removeFromWatchlist)
  const isInWatchlist = useUserDataStore((s) => movie ? s.watchlist.some((e) => e.movieId === movie.id) : false)

  const handlePlay = useCallback(() => {
    if (movie?.magnetURI) {
      navigate('/', { state: { magnetURI: movie.magnetURI } })
    }
  }, [movie, navigate])

  const toggleWatchlist = useCallback(() => {
    if (!movie) return
    if (isInWatchlist) {
      removeFromWatchlist(movie.id)
    } else {
      addToWatchlist({
        movieId: movie.id,
        slug: movie.slug,
        title: movie.title,
        poster: movie.poster,
        year: movie.year,
        rating: movie.rating,
        magnetURI: movie.magnetURI
      })
    }
  }, [movie, isInWatchlist, addToWatchlist, removeFromWatchlist])

  const addDownload = useTorrentStore((s) => s.addDownload)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = useCallback(async () => {
    if (!movie?.magnetURI) return
    setDownloading(true)
    try {
      await addDownload(movie.magnetURI)
      navigate('/downloads')
    } catch {
      // Error shown via store
    } finally {
      setDownloading(false)
    }
  }, [movie, addDownload, navigate])

  if (!movie) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-[var(--color-text-secondary)]">Movie not found</p>
        <button
          onClick={() => navigate('/browse')}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-bg-tertiary)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Browse
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ── Hero Backdrop ────────────────────────────── */}
      <div
        className="relative h-80 shrink-0 overflow-hidden"
        style={{
          backgroundImage: `url(${movie.backdrop || movie.poster})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 15%'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-primary)] via-[var(--color-bg-primary)]/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bg-primary)]/90 to-transparent" />
        {/* Back button */}
        <button
          onClick={() => navigate('/browse')}
          className="absolute top-4 left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm transition-all hover:bg-black/60 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      {/* ── Content ──────────────────────────────────── */}
      <div className="relative -mt-20 px-6 pb-8">
        <div className="flex gap-6">
          {/* Poster */}
          <div className="shrink-0">
            <div className="h-56 w-40 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10">
              <img
                src={movie.poster}
                alt={movie.title}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = ''
                  ;(e.target as HTMLImageElement).style.backgroundColor = 'var(--color-bg-tertiary)'
                }}
              />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 pt-16">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
              {movie.title}
            </h1>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="flex items-center gap-1 text-sm text-yellow-400">
                <Star className="h-4 w-4 fill-current" />
                {movie.rating} / 5
              </span>
              <span className="flex items-center gap-1 text-sm text-[var(--color-text-muted)]">
                <Calendar className="h-3.5 w-3.5" />
                {movie.year}
              </span>
              <span className="flex items-center gap-1 text-sm text-[var(--color-text-muted)]">
                <Clock className="h-3.5 w-3.5" />
                {movie.runtime}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-400">
                <Shield className="h-3 w-3" />
                {movie.license}
              </span>
            </div>

            {/* Genres */}
            <div className="flex gap-2 mb-5">
              {movie.genre.map((g) => (
                <span
                  key={g}
                  className="flex items-center gap-1 rounded-lg bg-[var(--color-bg-tertiary)] px-3 py-1 text-xs text-[var(--color-text-secondary)]"
                >
                  <Tag className="h-3 w-3" />
                  {g}
                </span>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              {movie.magnetURI ? (
                <>
                  <button
                    onClick={handlePlay}
                    className="flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all duration-200 hover:bg-[var(--color-accent-hover)] hover:scale-[1.03] active:scale-[0.98]"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Stream Now
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-5 py-2.5 text-sm font-medium text-emerald-400 transition-all duration-200 hover:bg-emerald-500 hover:text-white disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    {downloading ? 'Adding...' : 'Download'}
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2 rounded-xl bg-[var(--color-bg-tertiary)] px-6 py-2.5 text-sm text-[var(--color-text-muted)]">
                  <Play className="h-4 w-4" />
                  No stream available
                </div>
              )}
              <button
                onClick={toggleWatchlist}
                className={clsx(
                  'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200',
                  isInWatchlist
                    ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20'
                    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)]'
                )}
              >
                <Bookmark className={clsx('h-4 w-4', isInWatchlist && 'fill-current')} />
                {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Overview ─────────────────────────────── */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Overview
          </h2>
          <p className="text-sm leading-relaxed text-[var(--color-text-secondary)] max-w-2xl">
            {movie.overview}
          </p>
        </section>

        {/* ── Stream Info ──────────────────────────── */}
        {movie.magnetURI && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Stream Source
            </h2>
            <div className="glass rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Torrent Stream</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    Peer-to-peer · Sequential download · No waiting
                  </p>
                </div>
                <button
                  onClick={handlePlay}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/20"
                >
                  <Play className="h-3 w-3 fill-current" />
                  Play
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
