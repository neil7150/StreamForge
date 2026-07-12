import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Play, ChevronRight, Star, Zap, Clock, Info, ChevronLeft } from 'lucide-react'
import clsx from 'clsx'
import SmartSearchInput from '../components/ui/SmartSearchInput'
import { useTorrentStore } from '../stores/torrentStore'
import { formatBytes, formatSpeed, extractInfoHash } from '../lib/utils'
import {
  MOCK_MOVIES, getFeaturedMovies, getTopRated, getRecentlyAdded, getStreamable,
  type MockMovie
} from '../lib/mockData'
import { useUserDataStore } from '../stores/userDataStore'

// ── Horizontal scroll carousel component ──────────────────────────
function MovieCarousel({
  title,
  movies,
  onPlay,
  onDetail
}: {
  title: string
  movies: MockMovie[]
  onPlay: (m: MockMovie) => void
  onDetail: (m: MockMovie) => void
}) {
  const [scrollRef, setScrollRef] = useState<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScroll = useCallback(() => {
    if (!scrollRef) return
    setCanScrollLeft(scrollRef.scrollLeft > 10)
    setCanScrollRight(scrollRef.scrollLeft < scrollRef.scrollWidth - scrollRef.clientWidth - 10)
  }, [scrollRef])

  useEffect(() => {
    if (!scrollRef) return
    checkScroll()
    scrollRef.addEventListener('scroll', checkScroll)
    return () => scrollRef.removeEventListener('scroll', checkScroll)
  }, [scrollRef, checkScroll])

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef) return
    const amount = scrollRef.clientWidth * 0.75
    scrollRef.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  if (movies.length === 0) return null

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between px-6 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
          {title}
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => scroll('left')}
            className={clsx(
              'flex h-7 w-7 items-center justify-center rounded-lg transition-all',
              canScrollLeft
                ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)]'
                : 'text-[var(--color-text-muted)]/30 cursor-default'
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className={clsx(
              'flex h-7 w-7 items-center justify-center rounded-lg transition-all',
              canScrollRight
                ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)]'
                : 'text-[var(--color-text-muted)]/30 cursor-default'
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={setScrollRef}
        className="flex gap-3 overflow-x-auto px-6 pb-2 scrollbar-none scroll-smooth"
      >
        {movies.map((movie) => (
          <div
            key={movie.id}
            className="group shrink-0 w-36 cursor-pointer"
            onClick={() => onDetail(movie)}
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[var(--color-bg-tertiary)] mb-2 transition-all duration-300 group-hover:scale-105 group-hover:shadow-[var(--shadow-glow)] group-hover:ring-1 group-hover:ring-[var(--color-accent)]/50">
              <img
                src={movie.poster} alt={movie.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-primary)]/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* Hover play */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-y-0 translate-y-4">
                {movie.magnetURI ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onPlay(movie) }}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-[var(--shadow-glow)] transition-transform hover:scale-110"
                  >
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                  </button>
                ) : (
                  <button className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md shadow-lg">
                    <Info className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Rating */}
              <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 backdrop-blur-sm">
                <Star className="h-2 w-2 fill-yellow-400 text-yellow-400" />
                <span className="text-[9px] font-bold text-white">{movie.rating}</span>
              </div>
            </div>

            <h3 className="text-xs font-medium text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors">
              {movie.title}
            </h3>
            <p className="text-[10px] text-[var(--color-text-muted)]">{movie.year} · {movie.runtime}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Main Home Page ─────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const addTorrent = useTorrentStore((s) => s.addTorrent)
  const isLoading = useTorrentStore((s) => s.isLoading)
  const error = useTorrentStore((s) => s.error)
  const streams = useTorrentStore((s) => s.streams)
  const progress = useTorrentStore((s) => s.progress)
  const clearError = useTorrentStore((s) => s.clearError)
  const removeTorrent = useTorrentStore((s) => s.removeTorrent)

  const [heroIndex, setHeroIndex] = useState(0)
  const featured = getFeaturedMovies()
  const hero = featured[heroIndex % featured.length]

  // Rotate hero every 8 seconds
  useEffect(() => {
    if (featured.length <= 1) return
    const timer = setInterval(() => setHeroIndex((i) => i + 1), 8000)
    return () => clearInterval(timer)
  }, [featured.length])

  const handleMagnet = useCallback(
    (magnetURI: string) => {
      clearError()
      const hash = extractInfoHash(magnetURI)
      if (hash) {
        // Fire-and-forget: start adding, navigate to player immediately
        addTorrent(magnetURI).catch(() => {})
        navigate(`/player/${hash}`)
      }
    },
    [addTorrent, navigate, clearError]
  )

  const handleSearch = useCallback(
    (query: string) => {
      navigate('/search', { state: { query } })
    },
    [navigate]
  )

  // Auto-play when navigated from Browse/MovieDetail
  useEffect(() => {
    const state = location.state as { magnetURI?: string } | null
    if (state?.magnetURI) {
      handleMagnet(state.magnetURI)
      window.history.replaceState({}, '')
    }
  }, [location.state, handleMagnet])

  const handlePlay = useCallback((movie: MockMovie) => {
    if (movie.magnetURI) {
      handleMagnet(movie.magnetURI)
    }
  }, [handleMagnet])

  const handleDetail = useCallback((movie: MockMovie) => {
    navigate(`/movie/${movie.slug}`)
  }, [navigate])

  const activeTorrents = Array.from(streams.values())

  return (
    <div className="flex h-full flex-col overflow-y-auto">

      {/* ══ SMART SEARCH / STREAM INPUT ════════════════════ */}
      <section className="px-6 pt-6 pb-2 shrink-0">
        <SmartSearchInput
          onMagnet={handleMagnet}
          onSearch={handleSearch}
          error={error}
          searchPlaceholder="Search movies, shows... or paste a magnet link to stream"
        />
      </section>

      {/* ══ HERO BANNER ══════════════════════════════════════ */}
      {hero && (
        <section
          className="relative h-96 shrink-0 overflow-hidden"
          style={{
            backgroundImage: `url(${hero.backdrop || hero.poster})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 15%'
          }}
        >
          {/* Gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bg-primary)] via-[var(--color-bg-primary)]/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-primary)] via-[var(--color-bg-primary)]/20 to-transparent" />

          {/* Content */}
          <div className="relative flex h-full flex-col justify-end p-8 pb-10 max-w-2xl">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)]/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)] backdrop-blur-sm">
                <Zap className="h-3 w-3" /> Featured
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-yellow-400 drop-shadow-md">
                <Star className="h-3.5 w-3.5 fill-current" /> {hero.rating}
              </span>
              <span className="text-xs font-medium text-white/70">{hero.year}</span>
              <span className="flex items-center gap-1 text-xs font-medium text-white/70">
                <Clock className="h-3 w-3" /> {hero.runtime}
              </span>
            </div>

            <h1 className="text-4xl font-extrabold text-white mb-3 leading-tight drop-shadow-lg">
              {hero.title}
            </h1>
            <p className="text-sm leading-relaxed text-white/80 line-clamp-3 mb-6 max-w-xl drop-shadow-md">
              {hero.overview}
            </p>

            <div className="flex gap-4">
              {hero.magnetURI && (
                <button
                  onClick={() => handlePlay(hero)}
                  className="flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:bg-[var(--color-accent-hover)] hover:scale-[1.03] active:scale-[0.97]"
                >
                  <Play className="h-4 w-4 fill-current" /> Stream Now
                </button>
              )}
              <button
                onClick={() => handleDetail(hero)}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20"
              >
                <Info className="h-4 w-4" /> More Info
              </button>
            </div>

            {/* Hero dots */}
            {featured.length > 1 && (
              <div className="flex gap-1.5 mt-4">
                {featured.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setHeroIndex(i)}
                    className={clsx(
                      'h-1 rounded-full transition-all duration-300',
                      i === heroIndex % featured.length
                        ? 'w-6 bg-[var(--color-accent)]'
                        : 'w-1.5 bg-white/30 hover:bg-white/50'
                    )}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ══ ACTIVE STREAMS ═══════════════════════════════════ */}
      {activeTorrents.length > 0 && (
        <section className="px-6 pb-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Now Playing
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
            {activeTorrents.map((torrent) => {
              const prog = progress.get(torrent.infoHash)
              const pct = prog ? prog.progress * 100 : 0
              return (
                <div
                  key={torrent.infoHash}
                  onClick={() => navigate(`/player/${torrent.infoHash}`)}
                  className="glass group shrink-0 w-64 cursor-pointer rounded-xl p-3 transition-all duration-200 hover:shadow-[var(--shadow-card-hover)]"
                >
                  <h3 className="text-xs font-medium text-[var(--color-text-primary)] truncate mb-2 group-hover:text-[var(--color-accent)]">
                    {torrent.name || 'Loading…'}
                  </h3>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-tertiary)] mb-2">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: 'linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))'
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-muted)]">
                    <span>{pct.toFixed(1)}%</span>
                    {prog && (
                      <>
                        <span>↓ {formatSpeed(prog.downloadSpeed)}</span>
                        <span>{prog.numPeers} peers</span>
                      </>
                    )}
                    <span className="ml-auto">{formatBytes(torrent.totalSize)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ══ CONTINUE WATCHING ════════════════════════════════ */}
      {(() => {
        const history = useUserDataStore.getState().history
        const continueItems = history.filter((h) => h.progress > 0 && h.progress < 0.95)
        if (continueItems.length === 0) return null
        return (
          <section className="mb-6">
            <h2 className="px-6 mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              ▶ Continue Watching
            </h2>
            <div className="flex gap-4 overflow-x-auto px-6 pb-2 scrollbar-none">
              {continueItems.map((item) => {
                const movie = MOCK_MOVIES.find((m) => m.id === item.movieId)
                const image = movie?.backdrop || movie?.poster || item.poster
                return (
                  <div
                    key={item.movieId}
                    onClick={() => navigate(`/player/${item.movieId}`)}
                    className="group shrink-0 w-64 cursor-pointer"
                  >
                    <div className="relative aspect-video overflow-hidden rounded-xl bg-[var(--color-bg-tertiary)] mb-2.5 transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-[var(--shadow-glow)] group-hover:ring-1 group-hover:ring-[var(--color-accent)]/50">
                      {image && (
                        <img
                          src={image}
                          alt={item.title}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 opacity-60"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-primary)]/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-y-0 translate-y-2">
                        <button className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-lg transition-transform hover:scale-110">
                          <Play className="h-4 w-4 fill-current ml-0.5" />
                        </button>
                      </div>

                      {/* Progress bar anchored to bottom of image */}
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--color-bg-primary)]/80">
                        <div
                          className="h-full bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent)]"
                          style={{ width: `${item.progress * 100}%` }}
                        />
                      </div>
                    </div>
                    <h3 className="text-sm font-medium text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {Math.round(item.progress * 100)}% watched
                    </p>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })()}

      {/* ══ MOVIE CAROUSELS ══════════════════════════════════ */}
      <MovieCarousel title="🔥 Ready to Stream" movies={getStreamable()} onPlay={handlePlay} onDetail={handleDetail} />
      <MovieCarousel title="⭐ Top Rated" movies={getTopRated()} onPlay={handlePlay} onDetail={handleDetail} />
      <MovieCarousel title="🆕 Recently Added" movies={getRecentlyAdded()} onPlay={handlePlay} onDetail={handleDetail} />
      <MovieCarousel title="🎭 Classic Cinema" movies={MOCK_MOVIES.filter(m => m.genre.includes('Classic'))} onPlay={handlePlay} onDetail={handleDetail} />
      <MovieCarousel title="👻 Horror" movies={MOCK_MOVIES.filter(m => m.genre.includes('Horror'))} onPlay={handlePlay} onDetail={handleDetail} />
      <MovieCarousel title="🚀 Sci-Fi" movies={MOCK_MOVIES.filter(m => m.genre.includes('Sci-Fi'))} onPlay={handlePlay} onDetail={handleDetail} />

      <div className="h-6" /> {/* Bottom spacer */}
    </div>
  )
}
