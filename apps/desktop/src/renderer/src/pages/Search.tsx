import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Star, Calendar, Clock, Play, 
  Users, HardDrive, Loader2, Globe, Library, Zap, Download
} from 'lucide-react'
import clsx from 'clsx'
import { MOCK_MOVIES, type MockMovie } from '../lib/mockData'
import { searchTorrents, type TorrentSearchResult } from '../lib/torrentSearch'
import { useTorrentStore } from '../stores/torrentStore'
import SmartSearchInput from '../components/ui/SmartSearchInput'
import { extractInfoHash } from '../lib/utils'

type Tab = 'torrents' | 'library'

const CATEGORY_FILTERS = ['All', 'Movies', 'TV', 'HD Movies', 'HD TV', 'Music', 'Games', 'Apps']

export default function Search() {
  const navigate = useNavigate()
  const location = useLocation()

  // Pull initial query from navigation state (e.g. from Home page search)
  const locationState = location.state as { query?: string } | null
  const [query, setQuery] = useState(locationState?.query ?? '')
  const [tab, setTab] = useState<Tab>('torrents')

  // Library search
  const libraryResults = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return MOCK_MOVIES.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.overview.toLowerCase().includes(q) ||
        m.genre.some((g) => g.toLowerCase().includes(q))
    )
  }, [query])

  // Torrent search
  const [torrentResults, setTorrentResults] = useState<TorrentSearchResult[]>([])
  const [torrentLoading, setTorrentLoading] = useState(false)
  const [torrentError, setTorrentError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const doTorrentSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setTorrentResults([])
      return
    }
    setTorrentLoading(true)
    setTorrentError(null)
    try {
      const results = await searchTorrents(q)
      setTorrentResults(results)
      if (results.length === 0) setTorrentError('No results found')
    } catch {
      setTorrentError('Search failed. Check your connection.')
    } finally {
      setTorrentLoading(false)
    }
  }, [])

  // Debounced auto-search for torrents
  useEffect(() => {
    if (tab !== 'torrents') return
    clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setTorrentResults([])
      setTorrentError(null)
      return
    }
    debounceRef.current = setTimeout(() => doTorrentSearch(query), 600)
    return () => clearTimeout(debounceRef.current)
  }, [query, tab, doTorrentSearch])

  // If navigated here with a query, trigger a search immediately
  useEffect(() => {
    if (locationState?.query) {
      doTorrentSearch(locationState.query)
      // Clear the state so navigating back/forward doesn't re-trigger
      window.history.replaceState({}, '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredTorrents = useMemo(() => {
    if (categoryFilter === 'All') return torrentResults
    return torrentResults.filter((r) => r.category === categoryFilter)
  }, [torrentResults, categoryFilter])

  const handlePlayMovie = (movie: MockMovie) => {
    if (movie.magnetURI) navigate('/', { state: { magnetURI: movie.magnetURI } })
  }

  const handleStreamTorrent = (result: TorrentSearchResult) => {
    // Extract hash from the magnet URI and navigate to player immediately
    // The player page has its own loading/retry UI
    const hash = extractInfoHash(result.magnetURI)
    if (hash) {
      // Fire-and-forget: start adding the torrent in the background
      window.torrentAPI.addTorrent(result.magnetURI).catch(() => {})
      navigate(`/player/${hash}`)
    }
  }

  const addDownload = useTorrentStore((s) => s.addDownload)
  const addTorrent = useTorrentStore((s) => s.addTorrent)
  const storeError = useTorrentStore((s) => s.error)
  const clearError = useTorrentStore((s) => s.clearError)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const handleDownloadTorrent = async (result: TorrentSearchResult) => {
    setDownloadingId(result.id)
    try {
      await addDownload(result.magnetURI)
      navigate('/downloads')
    } catch {
      // Error shown via store
    } finally {
      setDownloadingId(null)
    }
  }

  // SmartSearchInput handlers
  const handleSearch = useCallback((q: string) => {
    setQuery(q)
    setTab('torrents')
    doTorrentSearch(q)
  }, [doTorrentSearch])

  const handleMagnet = useCallback((magnetURI: string) => {
    clearError()
    const hash = extractInfoHash(magnetURI)
    if (hash) {
      // Fire-and-forget: start adding, navigate immediately
      addTorrent(magnetURI).catch(() => {})
      navigate(`/player/${hash}`)
    }
  }, [addTorrent, navigate, clearError])

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ─── Header ─────────────────────────────────────── */}
      <section className="px-6 pt-6 pb-0 shrink-0">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Search</h1>

        {/* Smart unified input */}
        <SmartSearchInput
          onMagnet={handleMagnet}
          onSearch={handleSearch}
          initialValue={query}
          error={storeError}
          searchPlaceholder="Search worldwide torrents... or paste a magnet link to stream"
          autoFocus
        />

        {/* Tabs */}
        <div className="flex gap-1 mt-5 border-b border-[var(--color-border)]">
          <button
            onClick={() => setTab('torrents')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px',
              tab === 'torrents'
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            )}
          >
            <Globe className="h-3.5 w-3.5" /> Torrents
          </button>
          <button
            onClick={() => setTab('library')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px',
              tab === 'library'
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            )}
          >
            <Library className="h-3.5 w-3.5" /> Library
          </button>
        </div>
      </section>

      {/* ─── Results ─────────────────────────────────────── */}
      <section className="flex-1 px-6 pb-8 pt-5">

        {/* ═══ TORRENTS TAB ════════════════════════════════ */}
        {tab === 'torrents' && (
          <>
            {/* Category filters */}
            {torrentResults.length > 0 && (
              <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-none pb-1">
                {CATEGORY_FILTERS.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={clsx(
                      'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200',
                      categoryFilter === cat
                        ? 'bg-[var(--color-accent)] text-white shadow-[var(--shadow-glow)]'
                        : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)]'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Loading */}
            {torrentLoading && (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--color-accent)] mb-3" />
                <p className="text-sm text-[var(--color-text-muted)]">Searching torrents...</p>
              </div>
            )}

            {/* Empty state */}
            {!torrentLoading && !query.trim() && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Globe className="h-12 w-12 text-[var(--color-text-muted)]/30 mb-4" />
                <p className="text-sm text-[var(--color-text-muted)]">Search for any torrent</p>
                <p className="text-xs text-[var(--color-text-muted)]/60 mt-1">
                  Type a movie, show, or file name · or paste a magnet link above
                </p>
              </div>
            )}

            {/* Error */}
            {!torrentLoading && torrentError && query.trim() && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-sm text-[var(--color-text-secondary)]">{torrentError}</p>
              </div>
            )}

            {/* Results */}
            {!torrentLoading && filteredTorrents.length > 0 && (
              <div>
                <p className="text-xs text-[var(--color-text-muted)] mb-3">
                  {filteredTorrents.length} result{filteredTorrents.length !== 1 ? 's' : ''}
                  {categoryFilter !== 'All' && ` in ${categoryFilter}`}
                </p>
                <div className="space-y-2">
                  {filteredTorrents.map((result) => (
                    <div
                      key={result.id}
                      className="group flex items-center gap-4 rounded-xl bg-[var(--color-bg-tertiary)] p-3.5 transition-all duration-200 hover:bg-[var(--color-bg-card-hover)] hover:shadow-[var(--shadow-card)] hover:translate-x-0.5"
                    >
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors">
                          {result.name}
                        </h3>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                            <Users className="h-2.5 w-2.5" /> {result.seeders} seeds
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-red-400">
                            <Users className="h-2.5 w-2.5" /> {result.leechers} leech
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                            <HardDrive className="h-2.5 w-2.5" /> {result.size}
                          </span>
                          <span className="rounded bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-muted)]">
                            {result.category}
                          </span>
                          {result.added && (
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              {result.added}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
                        <button
                          onClick={() => handleStreamTorrent(result)}
                          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)]/10 px-3 py-2 text-xs font-medium text-[var(--color-accent)] transition-all hover:bg-[var(--color-accent)] hover:text-white hover:shadow-[var(--shadow-glow)]"
                        >
                          <Zap className="h-3 w-3" /> Stream
                        </button>
                        <button
                          onClick={() => handleDownloadTorrent(result)}
                          disabled={downloadingId === result.id}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400 transition-all hover:bg-emerald-500 hover:text-white disabled:opacity-50"
                        >
                          <Download className="h-3 w-3" /> {downloadingId === result.id ? 'Adding...' : 'Download'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ LIBRARY TAB ════════════════════════════════ */}
        {tab === 'library' && (
          <>
            {query.trim() === '' ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Library className="h-12 w-12 text-[var(--color-text-muted)]/30 mb-4" />
                <p className="text-sm text-[var(--color-text-muted)]">Search your local library</p>
                <p className="text-xs text-[var(--color-text-muted)]/60 mt-1">
                  Search by title, genre, or keyword
                </p>
              </div>
            ) : libraryResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  No results for "<span className="text-[var(--color-accent)]">{query}</span>"
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">Try a different search term</p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-[var(--color-text-muted)] mb-4">
                  {libraryResults.length} result{libraryResults.length !== 1 ? 's' : ''}
                </p>
                <div className="space-y-3">
                  {libraryResults.map((movie) => (
                    <div
                      key={movie.id}
                      onClick={() => navigate(`/movie/${movie.slug}`)}
                      className="group flex cursor-pointer items-center gap-4 rounded-xl bg-[var(--color-bg-tertiary)] p-3 transition-all duration-200 hover:bg-[var(--color-bg-card-hover)] hover:shadow-[var(--shadow-card)] hover:translate-x-0.5"
                    >
                      <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--color-bg-primary)]">
                        <img
                          src={movie.poster}
                          alt={movie.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors">
                          {movie.title}
                        </h3>
                        <p className="text-xs text-[var(--color-text-secondary)] line-clamp-1 mt-0.5">
                          {movie.overview}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="flex items-center gap-1 text-[10px] text-yellow-400">
                            <Star className="h-2.5 w-2.5 fill-current" />{movie.rating}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                            <Calendar className="h-2.5 w-2.5" />{movie.year}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                            <Clock className="h-2.5 w-2.5" />{movie.runtime}
                          </span>
                          <div className="flex gap-1 ml-1">
                            {movie.genre.slice(0, 2).map((g) => (
                              <span key={g} className="rounded bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-muted)]">{g}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      {movie.magnetURI && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePlayMovie(movie) }}
                          className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] opacity-0 group-hover:opacity-100 transition-all hover:bg-[var(--color-accent)] hover:text-white"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
