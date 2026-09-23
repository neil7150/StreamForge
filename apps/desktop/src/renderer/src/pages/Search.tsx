import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Film, Loader2, Search as SearchIcon, Tv } from 'lucide-react'
import { api } from '../lib/api'
import type { MovieSummary, SeriesSummary } from '../../../preload/index.d'
import SmartSearchInput from '../components/ui/SmartSearchInput'
import { extractInfoHash } from '../lib/utils'
import { useTorrentStore } from '../stores/torrentStore'

const SEARCH_DEBOUNCE_MS = 450

function searchFailureMessage(errors: unknown[]): string {
  const message = errors.map((error) => error instanceof Error ? error.message : String(error || '')).join(' ')
  if (/rate limit|429/i.test(message)) return 'The media catalogs are busy. Wait a moment and try again.'
  if (/timed out/i.test(message)) return 'The media search took too long to respond. Try again.'
  return 'Media search failed. Check your connection and try again.'
}

function Poster({ title, url, rating, badge }: {
  title: string
  url: string | null
  rating: number | null
  badge: 'Movie' | 'Series'
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(url) && !imageFailed
  const isMovie = badge === 'Movie'
  const PlaceholderIcon = isMovie ? Film : Tv

  return (
    <div className="relative aspect-[2/3] overflow-hidden bg-[#191c1f]">
      {showImage ? (
        <img
          src={url ?? undefined}
          alt={`${title} poster`}
          loading="lazy"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-[#1d2526] to-[#151719] px-4 text-center">
          <PlaceholderIcon className={isMovie ? 'h-7 w-7 text-amber-200/25' : 'h-7 w-7 text-sky-200/25'} />
          <span className="mt-3 line-clamp-2 text-[11px] font-medium leading-4 text-white/38">{title}</span>
        </div>
      )}
      <span className={isMovie
        ? 'absolute left-2 top-2 rounded-md border border-amber-200/20 bg-amber-950/85 px-1.5 py-1 text-[8px] font-semibold uppercase tracking-wide text-amber-100/90 backdrop-blur-sm'
        : 'absolute left-2 top-2 rounded-md border border-sky-200/20 bg-sky-950/85 px-1.5 py-1 text-[8px] font-semibold uppercase tracking-wide text-sky-100/90 backdrop-blur-sm'}>{badge}</span>
      {rating !== null && (
        <span className="absolute right-2 top-2 rounded-md bg-black/70 px-1.5 py-1 text-[9px] font-semibold text-white/78 backdrop-blur-sm">{rating.toFixed(1)}</span>
      )}
    </div>
  )
}

function SeriesCard({ series, onSelect }: { series: SeriesSummary; onSelect: () => void }) {
  const metadata = [series.year, series.status, series.network].filter(Boolean).join(' / ')
  return (
    <button type="button" onClick={onSelect} aria-label={`View seasons and episodes for ${series.title}`} className="media-card group min-w-0 overflow-hidden rounded-xl text-left transition-all hover:-translate-y-0.5 hover:border-sky-300/30">
      <Poster title={series.title} url={series.posterUrl} rating={series.rating} badge="Series" />
      <div className="px-3.5 pb-4 pt-3.5">
        <span className="block truncate text-[12px] font-semibold text-white/82">{series.title}</span>
        <span className="mt-1.5 block truncate text-[9px] text-white/33">{metadata || 'Series information unavailable'}</span>
        <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-[9px] text-sky-200/55">{series.genres.slice(0, 3).join(' / ') || 'View episodes'}</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-200/75" />
        </div>
      </div>
    </button>
  )
}

function MovieCard({ movie, onSelect }: { movie: MovieSummary; onSelect: () => void }) {
  const metadata = [movie.year, movie.language].filter(Boolean).join(' / ')
  return (
    <button type="button" onClick={onSelect} aria-label={`View torrent sources for ${movie.title}`} className="media-card group min-w-0 overflow-hidden rounded-xl text-left transition-all hover:-translate-y-0.5 hover:border-amber-300/30">
      <Poster title={movie.title} url={movie.posterUrl} rating={movie.rating} badge="Movie" />
      <div className="px-3.5 pb-4 pt-3.5">
        <span className="block truncate text-[12px] font-semibold text-white/82">{movie.title}</span>
        <span className="mt-1.5 block truncate text-[9px] text-white/33">{metadata || 'Movie information unavailable'}</span>
        <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-[9px] text-amber-200/55">{movie.genres.slice(0, 3).join(' / ') || 'View sources'}</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-200/75" />
        </div>
      </div>
    </button>
  )
}

export default function Search() {
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = location.state as { query?: string } | null
  const [query, setQuery] = useState(locationState?.query?.trim() ?? '')
  const [seriesResults, setSeriesResults] = useState<SeriesSummary[]>([])
  const [movieResults, setMovieResults] = useState<MovieSummary[]>([])
  const [hasBackendResults, setHasBackendResults] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchNotice, setSearchNotice] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const requestRef = useRef(0)
  const addTorrent = useTorrentStore((state) => state.addTorrent)
  const storeError = useTorrentStore((state) => state.error)
  const clearError = useTorrentStore((state) => state.clearError)

  const resetResults = useCallback(() => {
    setSeriesResults([])
    setMovieResults([])
    setSearchError(null)
    setSearchNotice(null)
    setHasBackendResults(false)
  }, [])

  const runSearch = useCallback(async (value: string) => {
    const safeQuery = value.trim()
    const requestId = ++requestRef.current
    if (!safeQuery) { resetResults(); setLoading(false); return }
    if (safeQuery.length < 2) {
      resetResults(); setSearchError('Enter at least 2 characters to search.'); setLoading(false); return
    }

    clearError()
    setLoading(true)
    resetResults()

    // Fetch from backend API and IPC catalogs in parallel
    const outcomes = await Promise.allSettled([
      window.torrentAPI.searchMovies(safeQuery),
      window.torrentAPI.searchSeries(safeQuery),
      api.search(safeQuery, 'all').catch(() => null)
    ])
    if (requestId !== requestRef.current) return

    const ipcMovies = outcomes[0].status === 'fulfilled' ? outcomes[0].value : []
    const ipcSeries = outcomes[1].status === 'fulfilled' ? outcomes[1].value : []

    // Merge backend results with IPC results
    let finalMovies = ipcMovies
    let finalSeries = ipcSeries
    let backendFound = false

    const backendResult = outcomes[2].status === 'fulfilled' ? outcomes[2].value : null
    if (backendResult?.data?.length) {
      backendFound = true
      const backendMovies: MovieSummary[] = backendResult.data
        .filter((item: any) => item.type === 'movie')
        .map((item: any) => ({
          id: item.slug || item.id,
          title: item.title,
          year: item.release_date ? new Date(item.release_date).getFullYear() : null,
          rating: item.avg_rating || null,
          posterUrl: item.poster_url || null,
          language: item.language || null,
          genres: [],
          imdbId: item.imdb_id || null
        }))
      const backendSeries: SeriesSummary[] = backendResult.data
        .filter((item: any) => item.type === 'show')
        .map((item: any) => ({
          id: item.id,
          title: item.title,
          year: item.release_date ? new Date(item.release_date).getFullYear() : null,
          rating: item.avg_rating || null,
          posterUrl: item.poster_url || null,
          status: null,
          network: null,
          type: null,
          language: item.language || null,
          genres: [],
          summary: item.overview || null,
          tvmazeUrl: null,
          imdbId: item.imdb_id || null
        }))

      // Merge: backend first, then IPC items not already in backend (by title match)
      const backendMovieTitles = new Set(backendMovies.map((m) => m.title.toLowerCase()))
      const backendSeriesTitles = new Set(backendSeries.map((s) => s.title.toLowerCase()))
      finalMovies = [...backendMovies, ...ipcMovies.filter((m) => !backendMovieTitles.has(m.title.toLowerCase()))]
      finalSeries = [...backendSeries, ...ipcSeries.filter((s) => !backendSeriesTitles.has(s.title.toLowerCase()))]
    }

    setMovieResults(finalMovies)
    setSeriesResults(finalSeries)
    setHasBackendResults(backendFound)

    const failures = outcomes.slice(0, 2).filter((outcome) => outcome.status === 'rejected')
    if (failures.length === 2 && !backendFound) {
      setSearchError(searchFailureMessage(failures.map((failure) => failure.status === 'rejected' ? failure.reason : null)))
    } else if (finalMovies.length + finalSeries.length === 0) {
      setSearchError(`No movies or series were found for "${safeQuery}".`)
    } else if (failures.length > 0 && !backendFound) {
      setSearchNotice(outcomes[0].status === 'rejected'
        ? 'The movie catalog is unavailable. Series results are shown.'
        : 'The series catalog is unavailable. Movie results are shown.')
    }
    setLoading(false)
  }, [clearError, resetResults])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query) { requestRef.current += 1; resetResults(); setLoading(false); return }
    debounceRef.current = setTimeout(() => void runSearch(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
  }, [query, resetResults, runSearch])

  const handleSearch = useCallback((value: string) => {
    const nextQuery = value.trim()
    if (nextQuery === query) { void runSearch(nextQuery); return }
    requestRef.current += 1
    clearTimeout(debounceRef.current)
    resetResults()
    setLoading(nextQuery.length >= 2)
    setQuery(nextQuery)
  }, [query, resetResults, runSearch])

  const clearSearch = useCallback(() => {
    requestRef.current += 1
    clearTimeout(debounceRef.current)
    setQuery('')
    resetResults()
    setLoading(false)
  }, [resetResults])

  const handleMagnet = useCallback((magnetURI: string) => {
    clearError()
    const hash = extractInfoHash(magnetURI)
    if (!hash) return
    void addTorrent(magnetURI).catch(() => {})
    navigate('/player/' + hash)
  }, [addTorrent, clearError, navigate])

  const totalResults = movieResults.length + seriesResults.length

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto w-full max-w-[1160px] px-10 pb-14 pt-9">
        <header>
          <h1 className="text-[22px] font-semibold tracking-[-0.025em] text-white/90">Discover</h1>
          <p className="mt-1.5 text-[11px] text-white/32">Search movies and series, then choose what to stream.</p>
        </header>
        <div className="mt-7 max-w-[820px]">
          <SmartSearchInput onMagnet={handleMagnet} onSearch={handleSearch} onClear={clearSearch} initialValue={query} error={storeError} searchPlaceholder="Search for a movie or TV series" autoFocus />
        </div>

        {loading && <div className="flex min-h-[300px] flex-col items-center justify-center" role="status"><Loader2 className="h-5 w-5 animate-spin text-teal-300" /><p className="mt-3 text-[10px] text-white/30">Searching movies and series...</p></div>}
        {!loading && !query && <div className="flex min-h-[330px] flex-col items-center justify-center text-center"><SearchIcon className="h-6 w-6 text-white/16" /><h2 className="mt-4 text-[13px] font-medium text-white/58">Search movies and series</h2><p className="mt-1.5 text-[10px] text-white/26">Results include artwork and identifying information.</p></div>}
        {!loading && searchError && query && <div className="flex min-h-[300px] flex-col items-center justify-center text-center" role="alert"><Tv className="h-6 w-6 text-white/15" /><p className="mt-4 max-w-md text-[12px] text-white/55">{searchError}</p><button onClick={() => void runSearch(query)} className="mt-4 rounded-lg border border-white/[0.09] px-3 py-2 text-[10px] text-white/55 hover:bg-white/[0.05]">Try again</button></div>}

        {!loading && totalResults > 0 && (
          <div className="mt-8">
            <div className="mb-5 flex items-center justify-between border-b border-white/[0.06] pb-3"><p className="text-[10px] text-white/30">{totalResults} result{totalResults === 1 ? '' : 's'}</p>{hasBackendResults ? <span className="text-[9px] text-teal-300/40">catalog + backend</span> : <span className="text-[9px] text-white/22">Movie and series catalogs</span>}</div>
            {searchNotice && <p className="mb-5 text-[9px] text-amber-200/55">{searchNotice}</p>}
            {movieResults.length > 0 && (
              <section className="rounded-2xl border border-amber-300/[0.11] bg-gradient-to-b from-amber-300/[0.045] to-transparent p-5" aria-label="Movie search results">
                <div className="mb-5 flex items-center justify-between border-b border-amber-200/[0.09] pb-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-300/[0.11] text-amber-200/80"><Film className="h-4.5 w-4.5" /></span>
                    <div>
                      <h2 className="text-[14px] font-semibold text-amber-50/90">Movies</h2>
                      <p className="mt-0.5 text-[9px] text-amber-100/35">Feature films · choose one to view sources</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-amber-200/[0.08] px-2.5 py-1 text-[9px] font-medium text-amber-100/55">{movieResults.length} found</span>
                </div>
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{movieResults.map((movie) => <MovieCard key={movie.id} movie={movie} onSelect={() => navigate(`/movie/${encodeURIComponent(movie.id)}`, { state: { movie, fromQuery: query } })} />)}</div>
              </section>
            )}
            {seriesResults.length > 0 && (
              <section className={`${movieResults.length ? 'mt-10' : ''} rounded-2xl border border-sky-300/[0.11] bg-gradient-to-b from-sky-300/[0.045] to-transparent p-5`} aria-label="Series search results">
                <div className="mb-5 flex items-center justify-between border-b border-sky-200/[0.09] pb-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-300/[0.11] text-sky-200/80"><Tv className="h-4.5 w-4.5" /></span>
                    <div>
                      <h2 className="text-[14px] font-semibold text-sky-50/90">TV Series</h2>
                      <p className="mt-0.5 text-[9px] text-sky-100/35">Shows · choose one to browse seasons and episodes</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-sky-200/[0.08] px-2.5 py-1 text-[9px] font-medium text-sky-100/55">{seriesResults.length} found</span>
                </div>
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{seriesResults.map((series) => <SeriesCard key={series.id} series={series} onSelect={() => navigate(`/series/${series.id}`, { state: { series, fromQuery: query } })} />)}</div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
