import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Clock3, Film, Loader2, Play, Star, Users, WifiOff } from 'lucide-react'
import type { MovieDetails, MovieSummary, TorrentProviderStatus, TorrentSearchResponse, TorrentSearchResult } from '../../../preload/index.d'
import CopyMagnetButton from '../components/ui/CopyMagnetButton'
import ProviderStatusBar from '../components/ui/ProviderStatusBar'
import { parseMovieCatalogId } from '../lib/movie-detail-policy'
import { rankSources, sortSourcesBySeeders } from '../lib/source-selection-policy'
import { extractInfoHash } from '../lib/utils'
import { usePlaybackSettingsStore } from '../stores/playbackSettingsStore'
import { useTorrentStore } from '../stores/torrentStore'
import { api } from '../lib/api'

interface MovieLocationState {
  movie?: MovieSummary
  fromQuery?: string
}

function compatibility(name: string): string {
  const value = name.toLowerCase()
  if (/h\.?264|x264|avc/.test(value) && /aac|mp3|opus/.test(value)) return 'Direct play'
  if (/hevc|h\.?265|x265|ac3|eac3|dts/.test(value)) return 'Compatibility mode'
  return 'Auto detect'
}

function quality(name: string): string {
  const value = name.toLowerCase()
  if (/2160p|4k/.test(value)) return '4K'
  if (/1080p/.test(value)) return '1080p'
  if (/720p/.test(value)) return '720p'
  if (/480p/.test(value)) return '480p'
  return 'Unknown quality'
}

function providerNotice(response: TorrentSearchResponse): string | null {
  if (response.cache === 'stale') return 'Live providers are unavailable. Showing recent cached sources.'
  const unavailable = response.providers.filter((provider) => provider.status !== 'ok')
  if (unavailable.length === 0) return null
  return unavailable.map((provider) => provider.status === 'cooldown'
    ? `${provider.name} temporarily paused`
    : `${provider.name} unavailable`).join(', ') + '. Other providers are shown.'
}

function MoviePoster({ movie }: { movie: MovieDetails }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="flex aspect-[2/3] h-60 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.09] bg-[#181b1d] shadow-2xl shadow-black/40">
      {movie.posterUrl && !failed ? <img src={movie.posterUrl} alt={`${movie.title} poster`} draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" /> : <Film className="h-9 w-9 text-white/14" />}
    </div>
  )
}

export default function MovieDetail() {
  const { slug } = useParams<{ slug: string }>()
  const movieId = useMemo(() => parseMovieCatalogId(slug), [slug])
  const navigate = useNavigate()
  const { state } = useLocation() as { state?: MovieLocationState }
  const [movie, setMovie] = useState<MovieDetails | null>(null)
  const [sources, setSources] = useState<TorrentSearchResult[]>([])
  const [providerStatuses, setProviderStatuses] = useState<TorrentProviderStatus[]>([])
  const [pageLoading, setPageLoading] = useState(true)
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [sourcesError, setSourcesError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const pageRequestRef = useRef(0)
  const sourceRequestRef = useRef(0)
  const addTorrent = useTorrentStore((store) => store.addTorrent)
  const clearTorrentError = useTorrentStore((store) => store.clearError)
  const playbackSettings = usePlaybackSettingsStore()
  const rankedSources = useMemo(() => rankSources(sources, playbackSettings), [playbackSettings, sources])
  const displayedSources = useMemo(() => sortSourcesBySeeders(sources), [sources])

  const goBack = useCallback(() => {
    navigate('/search', { state: state?.fromQuery ? { query: state.fromQuery } : undefined })
  }, [navigate, state?.fromQuery])

  const loadSources = useCallback(async (details: MovieDetails) => {
    const requestId = ++sourceRequestRef.current
    setSourcesLoading(true)
    setSources([])
    setProviderStatuses([])
    setSourcesError(null)
    setNotice(null)
    try {
      const response = await window.torrentAPI.searchMovieTorrents({
        title: details.title,
        year: details.year ?? undefined,
        imdbId: details.imdbId ?? undefined,
        torznabEndpoints: playbackSettings.torznabEnabled
          ? playbackSettings.torznabEndpoints.filter((endpoint) => endpoint.url.trim()).map((endpoint) => ({
            url: endpoint.url.trim(),
            ...(endpoint.apiKey.trim() ? { apiKey: endpoint.apiKey.trim() } : {})
          }))
          : undefined
      })
      if (requestId !== sourceRequestRef.current) return
      setSources(response.results)
      setProviderStatuses(response.providers || [])
      setNotice(providerNotice(response))
      if (response.results.length === 0) {
        const allUnavailable = response.providers.length > 0 && response.providers.every((provider) => provider.status !== 'ok')
        setSourcesError(allUnavailable ? 'All torrent providers are currently unavailable.' : 'No exact torrent sources were found for this movie.')
      }
    } catch (error) {
      if (requestId !== sourceRequestRef.current) return
      console.error('[MovieDetail] Source search failed:', error)
      setSourcesError('Movie sources could not be searched. Check your connection and try again.')
    } finally {
      if (requestId === sourceRequestRef.current) setSourcesLoading(false)
    }
  }, [playbackSettings.torznabEnabled, playbackSettings.torznabEndpoints])

  const loadMovie = useCallback(async () => {
    const requestId = ++pageRequestRef.current
    if (movieId === null) { setPageError('This movie address is invalid.'); setPageLoading(false); return }
    setPageLoading(true)
    setPageError(null)
    try {
      let details: MovieDetails
      if (!movieId.startsWith('cinemeta:') && !movieId.startsWith('yts:')) {
        const res = await api.getMovie(movieId) as any
        const data = res.data
        details = {
          id: data.id,
          title: data.title,
          year: data.release_date ? new Date(data.release_date).getFullYear() : null,
          posterUrl: data.poster_url || null,
          rating: data.avg_rating || null,
          genres: data.genres?.map((g: any) => g.name) ?? [],
          language: data.language || null,
          imdbId: data.imdb_id || null,
          summary: data.overview || null,
          runtimeMinutes: data.runtime_minutes || null,
          backdropUrl: data.backdrop_url || data.poster_url || null,
          contentRating: data.content_rating || null,
          ytsUrl: null
        }
      } else {
        details = await window.torrentAPI.getMovie(movieId)
      }

      if (requestId !== pageRequestRef.current) return
      setMovie(details)
      setPageLoading(false)
      void loadSources(details)
    } catch (error) {
      if (requestId !== pageRequestRef.current) return
      console.error('[MovieDetail] Movie load failed:', error)
      setPageError('The movie could not be loaded. Check your connection and try again.')
      setPageLoading(false)
    }
  }, [loadSources, movieId])

  useEffect(() => {
    void loadMovie()
    return () => { pageRequestRef.current += 1; sourceRequestRef.current += 1 }
  }, [loadMovie])

  const streamSource = useCallback((source: TorrentSearchResult) => {
    const hash = extractInfoHash(source.magnetURI)
    if (!movie) return
    if (!hash) {
      setSourcesError('This source returned an invalid magnet link. Choose another source.')
      return
    }
    clearTorrentError()
    void addTorrent(source.magnetURI, undefined, {
      title: movie.title,
      posterUrl: movie.posterUrl ?? movie.backdropUrl,
      contentKey: `movie:${movie.id}`,
      contentType: 'movie',
      catalogId: movie.id,
      sourceCandidates: rankedSources,
      sourceIndex: rankedSources.findIndex((candidate) => candidate.id === source.id)
    }).catch(() => {})
    navigate('/player/' + hash)
  }, [addTorrent, clearTorrentError, movie, navigate, rankedSources])

  if (pageLoading) return <div className="flex h-full flex-col items-center justify-center" role="status"><Loader2 className="h-6 w-6 animate-spin text-teal-300" /><p className="mt-3 text-[11px] text-white/35">Loading {state?.movie?.title || 'movie'}...</p></div>
  if (pageError || !movie) return <div className="flex h-full flex-col items-center justify-center px-8 text-center" role="alert"><WifiOff className="h-7 w-7 text-white/16" /><p className="mt-4 text-[12px] text-white/55">{pageError || 'The movie could not be loaded.'}</p><div className="mt-5 flex gap-2"><button onClick={goBack} className="rounded-lg border border-white/[0.09] px-3 py-2 text-[10px] text-white/55">Back to search</button>{movieId !== null && <button onClick={() => void loadMovie()} className="rounded-lg bg-white px-3 py-2 text-[10px] font-semibold text-[#17191b]">Try again</button>}</div></div>

  return (
    <div className="h-full overflow-y-auto">
      <header className="relative overflow-hidden border-b border-white/[0.06]">
        {(movie.backdropUrl || movie.posterUrl) && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <img
              src={movie.backdropUrl || movie.posterUrl || ''}
              alt=""
              draggable={false}
              referrerPolicy="no-referrer"
              className="absolute -top-12 -left-12 -right-12 h-[140%] w-[120%] max-w-none object-cover opacity-[0.22] blur-3xl saturate-150"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#101214] via-[#101214]/75 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#101214] via-[#101214]/85 to-[#101214]/60" />
          </div>
        )}
        <div className="relative mx-auto max-w-[1160px] px-10 pb-9 pt-7">
          <button onClick={goBack} className="mb-7 flex items-center gap-2 text-[10px] text-white/38 hover:text-white/75"><ArrowLeft className="h-3.5 w-3.5" /> Back to search</button>
          <div className="flex items-end gap-7">
            <MoviePoster movie={movie} />
            <div className="min-w-0 flex-1 pb-2">
              <div className="mb-3 flex gap-2"><span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[9px] text-white/48">Movie</span>{movie.contentRating && <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[9px] text-white/48">{movie.contentRating}</span>}</div>
              <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-white/92">{movie.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-white/40">{movie.year && <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{movie.year}</span>}{movie.runtimeMinutes && <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{movie.runtimeMinutes} min</span>}{movie.rating !== null && <span className="flex items-center gap-1.5 text-amber-200/65"><Star className="h-3.5 w-3.5 fill-current" />{movie.rating.toFixed(1)}</span>}</div>
              {movie.genres.length > 0 && <p className="mt-4 text-[10px] text-teal-200/55">{movie.genres.join(' / ')}</p>}
              {movie.summary && <p className="mt-4 max-w-3xl text-[11px] leading-5 text-white/43">{movie.summary}</p>}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1160px] px-10 pb-14 pt-8">
        <div className="mb-4 flex items-end justify-between border-b border-white/[0.06] pb-3"><div><h2 className="text-[15px] font-semibold text-white/78">Available torrents</h2><p className="mt-1 text-[9px] text-white/27">Ranked by source health, quality, and your playback settings.</p></div>{!sourcesLoading && rankedSources.length > 0 && <div className="flex items-center gap-3"><span className="text-[9px] text-white/25">{rankedSources.length} sources</span><button onClick={() => streamSource(rankedSources[0])} className="flex h-9 items-center gap-2 rounded-lg bg-teal-200 px-4 text-[10px] font-semibold text-[#10201f] hover:bg-teal-100"><Play className="h-3.5 w-3.5 fill-current" /> Play Best</button></div>}</div>
        {sourcesLoading && <div className="flex min-h-44 items-center justify-center" role="status"><Loader2 className="h-5 w-5 animate-spin text-teal-300" /><span className="ml-3 text-[10px] text-white/30">Checking movie sources...</span></div>}
        {!sourcesLoading && providerStatuses.length > 0 && <ProviderStatusBar providers={providerStatuses} className="mb-4" />}
        {!sourcesLoading && notice && <p className="mb-3 text-[9px] text-amber-200/55">{notice}</p>}
        {!sourcesLoading && sourcesError && <div className="rounded-xl border border-white/[0.07] px-5 py-8 text-center" role="alert"><p className="text-[11px] text-white/45">{sourcesError}</p><button onClick={() => void loadSources(movie)} className="mt-4 rounded-lg border border-white/[0.09] px-3 py-2 text-[10px] text-white/55">Try again</button></div>}
        {!sourcesLoading && displayedSources.length > 0 && <div className="divide-y divide-white/[0.055] border-y border-white/[0.06]">{displayedSources.map((source, index) => <article key={source.id} className="flex min-w-0 items-center gap-5 py-4"><span className="w-5 text-center text-[9px] text-white/18">{index + 1}</span><div className="min-w-0 flex-1"><h3 className="truncate text-[11px] font-medium text-white/68" title={source.name}>{source.name}</h3><div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-white/28"><span className="flex items-center gap-1 text-teal-200/58"><Users className="h-3 w-3" />{source.seeders} seeds</span><span>{source.size}</span><span>{quality(source.name)}</span><span>{compatibility(source.name)}</span><span>{source.provider}</span></div></div><CopyMagnetButton magnetURI={source.magnetURI} /><button onClick={() => streamSource(source)} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-[9px] font-semibold text-[#17191b]"><Play className="h-3 w-3 fill-current" /> Stream</button></article>)}</div>}
      </main>
    </div>
  )
}
