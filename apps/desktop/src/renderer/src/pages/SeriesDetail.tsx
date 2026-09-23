import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Film,
  Loader2,
  Play,
  Radio,
  Star,
  Tv,
  Users,
  WifiOff
} from 'lucide-react'
import type {
  AnimeSearchMetadata,
  EpisodeSummary,
  SeasonSummary,
  SeriesDetails,
  SeriesSummary,
  TorrentProviderStatus,
  TorrentSearchResponse,
  TorrentSearchResult
} from '../../../preload/index.d'
import CopyMagnetButton from '../components/ui/CopyMagnetButton'
import ProviderStatusBar from '../components/ui/ProviderStatusBar'
import type { WatchHistoryEntry } from '../stores/userDataStore'
import {
  absoluteEpisodeNumber,
  episodeCode,
  formatCatalogDate,
  isUpcomingEpisode,
  parseSeriesId,
  seasonLabel,
  usesAbsoluteEpisodeNumbering
} from '../lib/series-detail-policy'
import { rankSources, sortSourcesBySeeders } from '../lib/source-selection-policy'
import { extractInfoHash } from '../lib/utils'
import { api } from '../lib/api'
import { usePlaybackSettingsStore } from '../stores/playbackSettingsStore'
import { useTorrentStore } from '../stores/torrentStore'
import { useUserDataStore } from '../stores/userDataStore'

interface SeriesLocationState {
  series?: SeriesSummary
  fromQuery?: string
}

function catalogErrorMessage(error: unknown, subject: string): string {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/not found|404/i.test(message)) return `This ${subject} could not be found.`
  if (/rate limit|429/i.test(message)) return 'The series catalog is busy. Wait a moment and try again.'
  if (/timed out/i.test(message)) return 'The series catalog took too long to respond. Try again.'
  return `The ${subject} could not be loaded. Check your connection and try again.`
}

function sourceCompatibility(name: string): string {
  const normalized = name.toLowerCase()
  const directVideo = /h\.?264|x264|avc/.test(normalized)
  const directAudio = /aac|mp3|opus/.test(normalized)
  if (directVideo && directAudio) return 'Direct play'
  if (/hevc|h\.?265|x265|ac3|eac3|dts/.test(normalized)) return 'Compatibility mode'
  return 'Auto detect'
}

function sourceQuality(name: string): string {
  const normalized = name.toLowerCase()
  if (/2160p|4k/.test(normalized)) return '4K'
  if (/1080p/.test(normalized)) return '1080p'
  if (/720p/.test(normalized)) return '720p'
  if (/480p/.test(normalized)) return '480p'
  return 'Unknown quality'
}

function isEpisodePack(name: string): boolean {
  return /\b(?:batch|complete|collection)\b/i.test(name)
    || /(?:^|[^0-9])\d{1,4}\s*[-~]\s*\d{1,4}(?:$|[^0-9])/i.test(name)
}

function sourceFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/timed out/i.test(message)) return 'Episode source search timed out. Try again.'
  return 'Episode sources could not be searched. Check your connection and try again.'
}

function sourceResponseNotice(response: TorrentSearchResponse): string | null {
  if (response.cache === 'stale') return 'Live providers are unavailable. Showing recent cached sources.'
  const unavailable = response.providers.filter((provider) => provider.status !== 'ok')
  if (unavailable.length === 0) return null
  return unavailable.map((provider) => (
    provider.status === 'cooldown' ? `${provider.name} temporarily paused` : `${provider.name} unavailable`
  )).join(', ') + '. Other providers are shown.'
}

function Poster({ title, url }: { title: string; url: string | null }) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="flex aspect-[2/3] h-56 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.09] bg-[#181b1d] shadow-2xl shadow-black/40">
      {url && !failed ? (
        <img
          src={url}
          alt={`${title} poster`}
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <Film className="h-9 w-9 text-white/14" aria-label="Poster unavailable" />
      )}
    </div>
  )
}

function EpisodeStill({
  episode,
  onSelect,
  disabled,
  selected,
  title,
  watched
}: {
  episode: EpisodeSummary
  onSelect: () => void
  disabled: boolean
  selected: boolean
  title: string
  watched?: WatchHistoryEntry
}) {
  const [failed, setFailed] = useState(false)
  const isCompleted = watched && watched.progress >= 0.9
  const inProgress = watched && watched.progress > 0 && watched.progress < 0.9

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-expanded={selected}
      aria-controls={`episode-sources-${episode.id}`}
      title={title}
      className={`group relative flex aspect-video w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#181b1d] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60 disabled:cursor-default ${disabled ? '' : 'cursor-pointer'} ${selected ? 'ring-1 ring-teal-300/30' : 'hover:ring-1 hover:ring-white/20'}`}
    >
      {episode.stillUrl && !failed ? (
        <img
          src={episode.stillUrl}
          alt=""
          loading="lazy"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03] ${isCompleted ? 'opacity-70' : ''}`}
        />
      ) : (
        <Tv className="h-5 w-5 text-white/13" />
      )}

      {isCompleted && (
        <div className="absolute top-1.5 right-1.5 flex items-center justify-center rounded-full bg-[#10201f]/90 p-1 shadow-md backdrop-blur-sm">
          <Check className="h-3 w-3 text-teal-300 stroke-[3]" />
        </div>
      )}

      {inProgress && (
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60">
          <div
            className="h-full bg-teal-400"
            style={{ width: `${Math.max(4, Math.round(watched.progress * 100))}%` }}
          />
        </div>
      )}
    </button>
  )
}

export default function SeriesDetail() {
  const { seriesId: seriesIdParam } = useParams<{ seriesId: string }>()
  const seriesId = useMemo(() => parseSeriesId(seriesIdParam), [seriesIdParam])
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = location.state as SeriesLocationState | null
  const preview = locationState?.series
  const fromQuery = locationState?.fromQuery

  const [series, setSeries] = useState<SeriesDetails | null>(null)
  const [seasons, setSeasons] = useState<SeasonSummary[]>([])
  const [backendSeasons, setBackendSeasons] = useState<any[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | number | null>(null)
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([])
  const [pageLoading, setPageLoading] = useState(true)
  const [episodesLoading, setEpisodesLoading] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [episodesError, setEpisodesError] = useState<string | null>(null)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | number | null>(null)
  const [sourceResults, setSourceResults] = useState<TorrentSearchResult[]>([])
  const [episodeProviderStatuses, setEpisodeProviderStatuses] = useState<TorrentProviderStatus[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [sourcesError, setSourcesError] = useState<string | null>(null)
  const [sourcesNotice, setSourcesNotice] = useState<string | null>(null)
  const [animeMetadata, setAnimeMetadata] = useState<AnimeSearchMetadata | null>(null)
  const pageRequestRef = useRef(0)
  const episodeRequestRef = useRef(0)
  const sourceRequestRef = useRef(0)
  const addTorrent = useTorrentStore((state) => state.addTorrent)
  const clearTorrentError = useTorrentStore((state) => state.clearError)
  const playbackSettings = usePlaybackSettingsStore()
  const watchHistory = useUserDataStore((state) => state.history)
  const rankedSourceResults = useMemo(
    () => rankSources(sourceResults, playbackSettings),
    [playbackSettings, sourceResults]
  )
  const displayedSourceResults = useMemo(
    () => sortSourcesBySeeders(sourceResults),
    [sourceResults]
  )

  const selectedSeason = useMemo(
    () => seasons.find((season) => season.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId]
  )
  const absoluteNumbering = useMemo(() => usesAbsoluteEpisodeNumbering(seasons), [seasons])

  const goBack = useCallback(() => {
    navigate('/search', { state: fromQuery ? { query: fromQuery } : undefined })
  }, [fromQuery, navigate])

  const loadPage = useCallback(async () => {
    const requestId = ++pageRequestRef.current
    if (seriesId === null) {
      setPageError('This series address is invalid.')
      setPageLoading(false)
      return
    }

    setPageLoading(true)
    setPageError(null)
    try {
      let details: SeriesDetails
      let seasonList: SeasonSummary[]

      if (typeof seriesId === 'string') {
        const res = await api.getShow(seriesId) as any
        const data = res.data
        details = {
          id: data.id,
          title: data.title,
          posterUrl: data.poster_url || null,
          originalImageUrl: data.backdrop_url || data.poster_url || null,
          year: data.first_air_date ? new Date(data.first_air_date).getFullYear() : null,
          premiered: data.first_air_date || null,
          ended: data.last_air_date || null,
          runtimeMinutes: null,
          status: data.status || null,
          network: null,
          officialSite: null,
          type: null,
          language: data.language || null,
          genres: data.genres?.map((g: any) => g.name) ?? [],
          rating: data.avg_rating || null,
          summary: data.overview || null,
          tvmazeUrl: null,
          imdbId: null
        }
        seasonList = (data.seasons || []).map((s: any) => ({
          id: s.id,
          seriesId: data.id,
          number: s.season_number,
          name: s.title || null,
          episodeCount: s.episode_count || 0,
          premiereDate: s.air_date || null,
          endDate: null,
          network: null,
          posterUrl: s.poster_url || null,
          summary: s.overview || null
        }))
        if (requestId === pageRequestRef.current) setBackendSeasons(data.seasons || [])
      } else {
        [details, seasonList] = await Promise.all([
          window.torrentAPI.getSeries(seriesId as number),
          window.torrentAPI.getSeasons(seriesId as number)
        ])
        if (requestId === pageRequestRef.current) setBackendSeasons([])
      }

      if (requestId !== pageRequestRef.current) return
      setSeries(details)
      setSeasons(seasonList)
      setAnimeMetadata(null)
      const isAnime = details.language?.toLowerCase() === 'japanese'
        || details.type?.toLowerCase() === 'animation'
        || details.genres.some((genre) => /anime|animation/i.test(genre))
        || Boolean(details.network && /tokyo|mbs|fuji|nhk|at-x|animax/i.test(details.network))
      if (isAnime) {
        void window.torrentAPI.getAnimeSearchMetadata(details.title)
          .then((metadata) => { if (requestId === pageRequestRef.current) setAnimeMetadata(metadata) })
          .catch((error) => console.warn('[SeriesDetail] AniList alias lookup failed:', error))
      }
      setSelectedSeasonId((current) => {
        if (current !== null && seasonList.some((season) => season.id === current)) return current
        return (seasonList.find((season) => season.number > 0) ?? seasonList[0])?.id ?? null
      })
    } catch (error) {
      if (requestId !== pageRequestRef.current) return
      console.error('[SeriesDetail] Series load failed:', error)
      setPageError(catalogErrorMessage(error, 'series'))
      setSeries(null)
      setAnimeMetadata(null)
      setSeasons([])
      setSelectedSeasonId(null)
    } finally {
      if (requestId === pageRequestRef.current) setPageLoading(false)
    }
  }, [seriesId])

  useEffect(() => {
    void loadPage()
    return () => { pageRequestRef.current += 1 }
  }, [loadPage])

  const loadEpisodes = useCallback(async (seasonId: string | number) => {
    const requestId = ++episodeRequestRef.current
    setEpisodesLoading(true)
    setEpisodesError(null)
    setEpisodes([])
    try {
      let episodeList: EpisodeSummary[]
      if (typeof seasonId === 'string') {
        const season = backendSeasons.find(s => s.id === seasonId)
        episodeList = (season?.episodes || []).map((e: any) => ({
          id: e.id,
          seasonId: seasonId,
          seasonNumber: season.season_number,
          episodeNumber: e.episode_number,
          title: e.title,
          type: null,
          airDate: e.air_date ? e.air_date.split('T')[0] : null,
          airStamp: e.air_date || null,
          runtimeMinutes: e.runtime_minutes || null,
          stillUrl: e.still_url || null,
          summary: e.overview || null,
          tvmazeUrl: null
        }))
      } else {
        episodeList = await window.torrentAPI.getSeasonEpisodes(seasonId)
      }
      if (requestId !== episodeRequestRef.current) return
      setEpisodes(episodeList)
    } catch (error) {
      if (requestId !== episodeRequestRef.current) return
      console.error('[SeriesDetail] Episode load failed:', error)
      setEpisodesError(catalogErrorMessage(error, 'episode list'))
    } finally {
      if (requestId === episodeRequestRef.current) setEpisodesLoading(false)
    }
  }, [backendSeasons])

  useEffect(() => {
    if (selectedSeasonId === null) {
      episodeRequestRef.current += 1
      setEpisodes([])
      setEpisodesLoading(false)
      setEpisodesError(null)
      sourceRequestRef.current += 1
      setSelectedEpisodeId(null)
      setSourceResults([])
      setEpisodeProviderStatuses([])
      setSourcesLoading(false)
      setSourcesError(null)
      setSourcesNotice(null)
      return
    }
    sourceRequestRef.current += 1
    setSelectedEpisodeId(null)
    setSourceResults([])
    setEpisodeProviderStatuses([])
    setSourcesLoading(false)
    setSourcesError(null)
    setSourcesNotice(null)
    void loadEpisodes(selectedSeasonId)
    return () => { episodeRequestRef.current += 1 }
  }, [loadEpisodes, selectedSeasonId])

  useEffect(() => () => { sourceRequestRef.current += 1 }, [])

  const findEpisodeSources = useCallback(async (episode: EpisodeSummary) => {
    if (!series || episode.episodeNumber === null || isUpcomingEpisode(episode)) return
    const requestId = ++sourceRequestRef.current
    setSelectedEpisodeId(episode.id)
    setSourceResults([])
    setSourcesLoading(true)
    setSourcesError(null)
    setSourcesNotice(null)
    try {
      const absoluteNumber = absoluteNumbering || animeMetadata
        ? absoluteEpisodeNumber(seasons, episode.seasonNumber, episode.episodeNumber)
        : undefined
      const response = await window.torrentAPI.searchEpisodeTorrents({
        seriesTitle: series.title,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        episodeTitle: episode.title,
        imdbId: series.imdbId ?? undefined,
        seriesAliases: animeMetadata?.aliases,
        absoluteEpisodeNumber: absoluteNumber,
        absoluteEpisodeOnly: absoluteNumbering,
        torznabEndpoints: playbackSettings.torznabEnabled
          ? playbackSettings.torznabEndpoints.filter((endpoint) => endpoint.url.trim()).map((endpoint) => ({
            url: endpoint.url.trim(),
            ...(endpoint.apiKey.trim() ? { apiKey: endpoint.apiKey.trim() } : {})
          }))
          : undefined,
        stremioAddonUrls: playbackSettings.stremioAddonEnabled
          ? playbackSettings.stremioAddonUrls.map((url) => url.trim()).filter(Boolean)
          : undefined
      })
      if (requestId !== sourceRequestRef.current) return
      setSourceResults(response.results)
      setEpisodeProviderStatuses(response.providers || [])
      setSourcesNotice(sourceResponseNotice(response))
      if (response.results.length === 0) {
        const allUnavailable = response.providers.length > 0
          && response.providers.every((provider) => provider.status !== 'ok')
        setSourcesError(allUnavailable
          ? 'All episode source providers are currently unavailable.'
          : 'No exact single-episode torrent sources were found for this episode.')
      }
    } catch (error) {
      if (requestId !== sourceRequestRef.current) return
      console.error('[SeriesDetail] Episode source search failed:', error)
      setSourcesError(sourceFailureMessage(error))
    } finally {
      if (requestId === sourceRequestRef.current) setSourcesLoading(false)
    }
  }, [absoluteNumbering, animeMetadata, playbackSettings.stremioAddonEnabled, playbackSettings.stremioAddonUrls, playbackSettings.torznabEnabled, playbackSettings.torznabEndpoints, seasons, series])

  const streamSource = useCallback(async (source: TorrentSearchResult, episode: EpisodeSummary) => {
    const hash = extractInfoHash(source.magnetURI)
    if (!series || episode.episodeNumber === null) return
    if (!hash) {
      setSourcesError('This source returned an invalid magnet link. Choose another source.')
      return
    }
    let next = episodes.find((candidate) => (
      candidate.episodeNumber !== null
      && candidate.seasonNumber === episode.seasonNumber
      && candidate.episodeNumber === episode.episodeNumber! + 1
      && !isUpcomingEpisode(candidate)
    ))
    if (!next) {
      const nextSeason = [...seasons]
        .filter((season) => season.number > episode.seasonNumber)
        .sort((a, b) => a.number - b.number)[0]
      if (nextSeason) {
        const nextSeasonEpisodes = await window.torrentAPI.getSeasonEpisodes(nextSeason.id).catch(() => [])
        next = nextSeasonEpisodes.find((candidate) => candidate.episodeNumber !== null && !isUpcomingEpisode(candidate))
      }
    }
    const episodeAbsoluteNumber = absoluteNumbering || animeMetadata
      ? absoluteEpisodeNumber(seasons, episode.seasonNumber, episode.episodeNumber)
      : undefined
    const seriesTitles = [...new Set([series.title, ...(animeMetadata?.aliases ?? [])])].slice(0, 12)
    clearTorrentError()
    void addTorrent(source.magnetURI, {
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      fileIndex: source.fileIndex,
      absoluteEpisodeNumber: episodeAbsoluteNumber,
      absoluteEpisodeOnly: absoluteNumbering,
      seriesTitles
    }, {
      title: `${series.title} — ${episodeCode(episode, absoluteNumbering ? episodeAbsoluteNumber : undefined)} ${episode.title}`,
      posterUrl: episode.stillUrl ?? series.posterUrl ?? series.originalImageUrl,
      contentKey: `episode:tvmaze:${episode.id}`,
      contentType: 'episode',
      catalogId: String(episode.id),
      seriesId: series.id,
      seriesTitle: series.title,
      seriesImdbId: series.imdbId ?? undefined,
      seriesAliases: seriesTitles,
      absoluteEpisodeOnly: absoluteNumbering,
      episodeId: episode.id,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.title,
      nextEpisode: next && next.episodeNumber !== null ? {
        id: next.id,
        seasonId: next.seasonId,
        seasonNumber: next.seasonNumber,
        episodeNumber: next.episodeNumber,
        title: next.title,
        stillUrl: next.stillUrl,
        absoluteEpisodeNumber: absoluteNumbering || animeMetadata
          ? absoluteEpisodeNumber(seasons, next.seasonNumber, next.episodeNumber)
          : undefined
      } : undefined,
      sourceCandidates: rankedSourceResults,
      sourceIndex: rankedSourceResults.findIndex((candidate) => candidate.id === source.id)
    }).catch(() => {})
    navigate('/player/' + hash)
  }, [absoluteNumbering, addTorrent, animeMetadata, clearTorrentError, episodes, navigate, rankedSourceResults, seasons, series])

  if (pageLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-teal-300" />
        <p className="mt-3 text-[11px] text-white/35">Loading {preview?.title || 'series'}...</p>
      </div>
    )
  }

  if (pageError || !series) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center" role="alert">
        <WifiOff className="h-7 w-7 text-white/16" />
        <p className="mt-4 max-w-md text-[12px] text-white/55">{pageError || 'The series could not be loaded.'}</p>
        <div className="mt-5 flex gap-2">
          <button onClick={goBack} className="rounded-lg border border-white/[0.09] px-3 py-2 text-[10px] text-white/55 hover:bg-white/[0.05]">Back to search</button>
          {seriesId !== null && <button onClick={() => void loadPage()} className="rounded-lg bg-white px-3 py-2 text-[10px] font-semibold text-[#17191b] hover:bg-white/90">Try again</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="relative overflow-hidden border-b border-white/[0.06]">
        {(series.originalImageUrl || series.posterUrl) && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <img
              src={series.originalImageUrl || series.posterUrl || ''}
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
          <button onClick={goBack} className="mb-7 flex items-center gap-2 text-[10px] text-white/38 hover:text-white/75">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to search
          </button>
          <div className="flex items-end gap-7">
            <Poster title={series.title} url={series.posterUrl ?? series.originalImageUrl} />
            <div className="min-w-0 flex-1 pb-2">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {series.status && <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[9px] text-white/48">{series.status}</span>}
                {series.type && <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[9px] text-white/48">{series.type}</span>}
              </div>
              <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-white/92">{series.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-white/40">
                {series.year && <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{series.year}</span>}
                {series.runtimeMinutes && <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{series.runtimeMinutes} min</span>}
                {series.network && <span className="flex items-center gap-1.5"><Radio className="h-3.5 w-3.5" />{series.network}</span>}
                {series.rating !== null && <span className="flex items-center gap-1.5 text-amber-200/65"><Star className="h-3.5 w-3.5 fill-current" />{series.rating.toFixed(1)}</span>}
              </div>
              {series.genres.length > 0 && <p className="mt-4 text-[10px] text-teal-200/55">{series.genres.join(' / ')}</p>}
              {series.summary && <p className="mt-4 max-w-3xl text-[11px] leading-5 text-white/43">{series.summary}</p>}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1160px] px-10 pb-14 pt-8">
        <section aria-labelledby="seasons-heading">
          <div className="flex items-end justify-between border-b border-white/[0.06] pb-3">
            <div>
              <h2 id="seasons-heading" className="text-[15px] font-semibold text-white/78">{absoluteNumbering ? 'Episodes' : 'Seasons'}</h2>
              <p className="mt-1 text-[9px] text-white/27">{absoluteNumbering ? 'Select an episode range.' : 'Select a season to view its episodes.'}</p>
            </div>
            <span className="text-[9px] text-white/22">Series data from TVmaze</span>
          </div>

          {seasons.length > 0 ? (
            <div className="scrollbar-none mt-5 flex gap-2 overflow-x-auto pb-1">
              {seasons.map((season) => (
                <button
                  key={season.id}
                  type="button"
                  onClick={() => setSelectedSeasonId(season.id)}
                  aria-pressed={selectedSeasonId === season.id}
                  className={selectedSeasonId === season.id
                    ? 'shrink-0 rounded-lg bg-white px-3.5 py-2 text-[10px] font-semibold text-[#17191b]'
                    : 'shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3.5 py-2 text-[10px] text-white/44 hover:bg-white/[0.06] hover:text-white/75'}
                >
                  {seasonLabel(season)}
                  {season.episodeCount !== null && <span className="ml-2 opacity-55">{season.episodeCount}</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-white/[0.08] px-5 py-8 text-center text-[11px] text-white/35">No episodes are listed for this series.</div>
          )}
        </section>

        {selectedSeason && (
          <section className="mt-8" aria-labelledby="episodes-heading">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 id="episodes-heading" className="text-[14px] font-semibold text-white/70">{seasonLabel(selectedSeason)}</h2>
                <p className="mt-1 text-[9px] text-white/27">{episodes.length || selectedSeason.episodeCount || 0} episodes</p>
              </div>
              {selectedSeason.premiereDate && <span className="text-[9px] text-white/27">Premiered {formatCatalogDate(selectedSeason.premiereDate)}</span>}
            </div>

            {episodesLoading && (
              <div className="flex min-h-44 items-center justify-center" role="status">
                <Loader2 className="h-5 w-5 animate-spin text-teal-300" />
                <span className="ml-3 text-[10px] text-white/30">Loading episodes...</span>
              </div>
            )}

            {!episodesLoading && episodesError && (
              <div className="rounded-xl border border-white/[0.07] px-5 py-8 text-center" role="alert">
                <p className="text-[11px] text-white/45">{episodesError}</p>
                <button onClick={() => void loadEpisodes(selectedSeason.id)} className="mt-4 rounded-lg border border-white/[0.09] px-3 py-2 text-[10px] text-white/55 hover:bg-white/[0.05]">Try again</button>
              </div>
            )}

            {!episodesLoading && !episodesError && episodes.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/[0.08] px-5 py-8 text-center text-[11px] text-white/35">No episodes are listed for this season.</div>
            )}

            {!episodesLoading && !episodesError && episodes.length > 0 && (
              <div className="divide-y divide-white/[0.055] border-y border-white/[0.06]">
                {episodes.map((episode) => {
                  const upcoming = isUpcomingEpisode(episode)
                  const canSearch = episode.episodeNumber !== null && !upcoming
                  const displayAbsoluteNumber = absoluteNumbering && episode.episodeNumber !== null
                    ? absoluteEpisodeNumber(seasons, episode.seasonNumber, episode.episodeNumber)
                    : undefined
                  const displayEpisodeCode = episodeCode(episode, displayAbsoluteNumber)
                  const selected = selectedEpisodeId === episode.id
                  const watched = watchHistory.find((entry) => entry.contentKey === `episode:tvmaze:${episode.id}`)
                  const sourceActionTitle = upcoming
                    ? 'Sources become available after this episode airs'
                    : episode.episodeNumber === null
                      ? 'This episode has no searchable episode number'
                      : `Find sources for ${displayEpisodeCode} ${episode.title}`
                  return (
                    <article key={episode.id} className="py-4">
                      <div className="flex min-w-0 gap-5">
                        <EpisodeStill
                          episode={episode}
                          onSelect={() => void findEpisodeSources(episode)}
                          disabled={!canSearch || (selected && sourcesLoading)}
                          selected={selected}
                          title={sourceActionTitle}
                          watched={watched}
                        />
                        <div className="min-w-0 flex-1 py-1">
                          <div className="flex items-start justify-between gap-4">
                            <button
                              type="button"
                              onClick={() => void findEpisodeSources(episode)}
                              disabled={!canSearch || (selected && sourcesLoading)}
                              aria-expanded={selected}
                              aria-controls={`episode-sources-${episode.id}`}
                              title={sourceActionTitle}
                              className="min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60 disabled:cursor-default"
                            >
                              <p className="text-[9px] font-semibold tracking-[0.08em] text-teal-200/55">{displayEpisodeCode}</p>
                              <h3 className={`mt-1 truncate text-[12px] font-semibold transition-colors ${canSearch ? 'text-white/72 hover:text-white' : 'text-white/45'}`}>{episode.title}</h3>
                            </button>
                            <div className="flex shrink-0 items-center gap-2">
                              {upcoming && <span className="rounded-full bg-amber-300/[0.08] px-2 py-1 text-[8px] font-medium text-amber-200/65">Upcoming</span>}
                              {!upcoming && episode.episodeNumber === null && <span className="rounded-full bg-white/[0.04] px-2 py-1 text-[8px] font-medium text-white/35">Unnumbered</span>}
                              {selected && sourcesLoading && <span className="flex items-center gap-1.5 text-[9px] text-teal-200/55"><Loader2 className="h-3 w-3 animate-spin" /> Finding sources</span>}
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-white/28">
                            {episode.airDate && <span>{formatCatalogDate(episode.airDate)}</span>}
                            {episode.runtimeMinutes && <span>{episode.runtimeMinutes} min</span>}
                            {episode.type && episode.type !== 'regular' && <span>{episode.type}</span>}
                            {watched && watched.progress >= 0.9 && <span className="flex items-center gap-1 text-teal-200/65"><CheckCircle2 className="h-3 w-3" /> Watched</span>}
                            {watched && watched.progress > 0 && watched.progress < 0.9 && <span className="text-teal-200/55">{Math.round(watched.progress * 100)}% watched</span>}
                          </div>
                          {episode.summary && <p className="mt-2 line-clamp-2 max-w-3xl text-[10px] leading-4 text-white/35">{episode.summary}</p>}
                        </div>
                      </div>

                      {selected && (
                        <div id={`episode-sources-${episode.id}`} className="ml-[180px] mt-4 overflow-hidden rounded-xl border border-white/[0.07] bg-[#141719]">
                          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                            <div>
                              <p className="text-[10px] font-semibold text-white/62">Sources for {displayEpisodeCode}</p>
                              <p className="mt-1 text-[8px] text-white/25">Exact releases and verified batches containing this episode are shown.</p>
                            </div>
                            {!sourcesLoading && rankedSourceResults.length > 0 && <div className="flex items-center gap-3"><span className="text-[9px] text-white/25">{rankedSourceResults.length} found</span><button onClick={() => streamSource(rankedSourceResults[0], episode)} className="flex h-8 items-center gap-1.5 rounded-lg bg-teal-200 px-3 text-[9px] font-semibold text-[#10201f]"><Play className="h-3 w-3 fill-current" /> Play Best</button></div>}
                          </div>

                          {sourcesLoading && (
                            <div className="flex min-h-28 items-center justify-center" role="status">
                              <Loader2 className="h-4 w-4 animate-spin text-teal-300" />
                              <span className="ml-2 text-[9px] text-white/30">Checking episode sources...</span>
                            </div>
                          )}

                          {!sourcesLoading && episodeProviderStatuses.length > 0 && (
                            <div className="px-4 pt-3">
                              <ProviderStatusBar providers={episodeProviderStatuses} />
                            </div>
                          )}

                          {!sourcesLoading && sourcesNotice && <p className="border-b border-white/[0.05] px-4 py-2 text-[9px] text-amber-200/55">{sourcesNotice}</p>}

                          {!sourcesLoading && sourcesError && (
                            <div className="px-4 py-6 text-center" role="alert">
                              <p className="text-[10px] text-white/40">{sourcesError}</p>
                              <button onClick={() => void findEpisodeSources(episode)} className="mt-3 rounded-lg border border-white/[0.09] px-3 py-2 text-[9px] text-white/52 hover:bg-white/[0.05]">Try again</button>
                            </div>
                          )}

                          {!sourcesLoading && displayedSourceResults.length > 0 && (
                            <div className="divide-y divide-white/[0.05]">
                              {displayedSourceResults.map((source, index) => (
                                <div key={source.id} className="flex min-w-0 items-center gap-4 px-4 py-3">
                                  <span className="w-4 text-center text-[8px] text-white/18">{index + 1}</span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[10px] font-medium text-white/62" title={source.name}>{source.name}</p>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] text-white/27">
                                      <span className="flex items-center gap-1 text-teal-200/58"><Users className="h-2.5 w-2.5" />{source.seeders} seeds</span>
                                      <span>{source.size}</span>
                                      <span>{sourceQuality(source.name)}</span>
                                      {isEpisodePack(source.name) && <span className="text-amber-200/55">Episode pack</span>}
                                      <span>{sourceCompatibility(source.name)}</span>
                                      <span>{source.provider}</span>
                                    </div>
                                  </div>
                                  <CopyMagnetButton magnetURI={source.magnetURI} />
                                  <button onClick={() => streamSource(source, episode)} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-[9px] font-semibold text-[#17191b] hover:bg-white/90">
                                    <Play className="h-3 w-3 fill-current" /> Stream
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
