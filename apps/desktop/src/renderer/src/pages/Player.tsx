import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Activity, ArrowLeft, Captions, Download, Film, ChevronDown, Play, RotateCcw, SkipForward } from 'lucide-react'
import clsx from 'clsx'
import type { OnlineSubtitleResult } from '../../../preload/index.d'
import VideoPlayer, { type PlaybackSeekRequest, type SubtitleTrack } from '../components/player/VideoPlayer'
import TorrentHealth from '../components/player/TorrentHealth'
import PlaybackDiagnosticsPanel from '../components/player/PlaybackDiagnosticsPanel'
import { useTorrentStore } from '../stores/torrentStore'
import { useUserDataStore } from '../stores/userDataStore'
import { extractInfoHash, formatBytes } from '../lib/utils'
import { cancelScheduledStreamCleanup, scheduleStreamCleanup } from '../lib/stream-cleanup-scheduler'
import { buildPlaybackDiagnosticsReport, type VideoElementDiagnostics } from '../lib/playback-diagnostics'
import { formatResumeTime, getPlaybackResumeTime } from '../lib/playback-resume'
import { createLatestTaskScheduler } from '../lib/latest-task-scheduler'
import { rankSources } from '../lib/source-selection-policy'
import { shouldAutomaticallyFallback } from '../lib/automatic-fallback-policy'
import { usePlaybackSettingsStore } from '../stores/playbackSettingsStore'

type PlayerMediaInfo = NonNullable<Awaited<ReturnType<Window['torrentAPI']['getMediaInfo']>>>

const PREFERRED_AUDIO_LANGUAGE_KEY = 'streamforge.preferredAudioLanguage'
const RAPID_SKIP_RESTART_DELAY_MS = 350

const SUBTITLE_LANGUAGE_NAMES: Record<string, string> = {
  ara: 'Arabic',
  chi: 'Chinese',
  zho: 'Chinese',
  dut: 'Dutch',
  nld: 'Dutch',
  eng: 'English',
  fre: 'French',
  fra: 'French',
  ger: 'German',
  deu: 'German',
  hin: 'Hindi',
  ind: 'Indonesian',
  ita: 'Italian',
  jpn: 'Japanese',
  kor: 'Korean',
  por: 'Portuguese',
  rus: 'Russian',
  spa: 'Spanish',
  tam: 'Tamil',
  tel: 'Telugu',
  tha: 'Thai',
  tur: 'Turkish',
  und: 'Unknown language'
}

function subtitleTrackLabel(track: PlayerMediaInfo['subtitleTracks'][number]): string {
  const language = SUBTITLE_LANGUAGE_NAMES[track.language] || track.language.toUpperCase()
  const title = track.title?.trim()
  return title ? `${title} · ${language}` : `${language} · ${track.codec.toUpperCase()}`
}

function choosePreferredAudioTrack(info: PlayerMediaInfo): number | null {
  let preferredLanguage = ''
  try {
    preferredLanguage = localStorage.getItem(PREFERRED_AUDIO_LANGUAGE_KEY) || ''
  } catch {
    // Preferences are optional when storage is unavailable.
  }

  const preferred = preferredLanguage
    ? info.audioTracks.find((track) => track.language === preferredLanguage)
    : undefined
  return (preferred ?? info.audioTracks.find((track) => track.isDefault) ?? info.audioTracks[0])?.index ?? null
}

type ConnectionPhase =
  | 'connecting'
  | 'metadata'
  | 'probing'
  | 'transcoding'
  | 'buffering'
  | 'playing'
  | 'stalled'

const PHASE_LABELS: Record<ConnectionPhase, string> = {
  connecting: 'Connecting to peers...',
  metadata: 'Retrieving torrent metadata...',
  probing: 'Checking video compatibility...',
  transcoding: 'Starting compatibility conversion...',
  buffering: 'Buffering playback window...',
  playing: 'Playing',
  stalled: 'Stream stalled - rebuilding the buffer...'
}


function playbackErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const mediaError = error as { code?: number; message?: string }
    const details = [mediaError.code ? `code ${mediaError.code}` : '', mediaError.message || ''].filter(Boolean)
    if (details.length > 0) return details.join(': ')
  }
  return String(error || 'Unknown playback error')
}
interface PlaybackURLOptions {
  start?: number
  audioTrack?: number
}

function buildPlaybackURL(
  baseURL: string,
  sessionId: string,
  requestId: number,
  options: PlaybackURLOptions = {}
): string {
  const separator = baseURL.includes('?') ? '&' : '?'
  const params = new URLSearchParams({
    session: sessionId,
    request: String(requestId)
  })
  if (options.start !== undefined) params.set('start', options.start.toFixed(3))
  if (options.audioTrack !== undefined) params.set('audio', String(options.audioTrack))
  return baseURL + separator + params.toString()
}

export default function Player() {
  const { infoHash } = useParams<{ infoHash: string }>()
  const navigate = useNavigate()

  const torrent = useTorrentStore((s) => (infoHash ? s.streams.get(infoHash) || s.downloads.get(infoHash) : undefined))
  const prog = useTorrentStore((s) => (infoHash ? s.progress.get(infoHash) : undefined))
  const streamError = useTorrentStore((s) => (
    infoHash ? s.torrentErrors.get(infoHash.toLowerCase()) : undefined
  ))
  const streamMagnet = useTorrentStore((s) => (
    infoHash ? s.streamMagnets.get(infoHash.toLowerCase()) ?? "" : ""
  ))
  const streamDisplayMetadata = useTorrentStore((s) => (
    infoHash ? s.streamDisplayMetadata.get(infoHash.toLowerCase()) : undefined
  ))
  const retryStream = useTorrentStore((s) => s.retryStream)
  const addTorrent = useTorrentStore((s) => s.addTorrent)
  const addDownload = useTorrentStore((s) => s.addDownload)
  const cleanupStream = useTorrentStore((s) => s.cleanupStream)
  const playbackSettings = usePlaybackSettingsStore()
  const savedHistoryEntry = useUserDataStore((s) => (
    infoHash ? s.history.find((entry) => (
      entry.movieId === infoHash
      || Boolean(streamDisplayMetadata?.contentKey && entry.contentKey === streamDisplayMetadata.contentKey)
    )) : undefined
  ))

  const [streamURL, setStreamURL] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null)
  const [showFileSelector, setShowFileSelector] = useState(false)
  const [manualFileSelectionComplete, setManualFileSelectionComplete] = useState(false)
  const [mediaInfo, setMediaInfo] = useState<PlayerMediaInfo | null>(null)
  const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] = useState<number | null>(null)
  const [playbackOffset, setPlaybackOffset] = useState(0)
  const [phase, setPhase] = useState<ConnectionPhase>('connecting')
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [videoDiagnostics, setVideoDiagnostics] = useState<VideoElementDiagnostics | null>(null)
  const [mediaProbeAttemptCount, setMediaProbeAttemptCount] = useState(0)
  const [streamURLAttemptCount, setStreamURLAttemptCount] = useState(0)
  const [phaseStartedAt, setPhaseStartedAt] = useState(() => Date.now())
  const [lastSeekTarget, setLastSeekTarget] = useState<number | null>(null)
  const [lastPlaybackError, setLastPlaybackError] = useState<string | null>(null)
  const [resumeNoticeTime, setResumeNoticeTime] = useState<number | null>(null)
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0)
  const [upNextCountdown, setUpNextCountdown] = useState<number | null>(null)
  const [nextEpisodeError, setNextEpisodeError] = useState<string | null>(null)
  const [showOnlineSubtitles, setShowOnlineSubtitles] = useState(false)
  const [onlineSubtitleResults, setOnlineSubtitleResults] = useState<OnlineSubtitleResult[]>([])
  const [onlineSubtitleTracks, setOnlineSubtitleTracks] = useState<SubtitleTrack[]>([])
  const [onlineSubtitleLoading, setOnlineSubtitleLoading] = useState(false)
  const [onlineSubtitleError, setOnlineSubtitleError] = useState<string | null>(null)
  const [downloadState, setDownloadState] = useState<'idle' | 'queueing' | 'queued' | 'started' | 'error'>('idle')
  const seekRequestRef = useRef(0)
  const rapidSkipSchedulerRef = useRef<ReturnType<typeof createLatestTaskScheduler> | null>(null)
  if (!rapidSkipSchedulerRef.current) {
    rapidSkipSchedulerRef.current = createLatestTaskScheduler(RAPID_SKIP_RESTART_DELAY_MS)
  }
  const playbackSessionRef = useRef(crypto.randomUUID())
  const currentPlaybackTimeRef = useRef(0)
  const fallbackAttemptedRef = useRef<string | null>(null)
  const playbackStartedRef = useRef(false)
  const smartDownloadedEpisodeRef = useRef<number | null>(null)
  const connectionStartedAtRef = useRef(Date.now())
  const isCancellingRef = useRef(false)
  const [fallbackToast, setFallbackToast] = useState<string | null>(null)
  const stallCounterRef = useRef(0)
  const initialHistoryEntryRef = useRef(savedHistoryEntry)
  const resumeHashRef = useRef(infoHash)
  if (resumeHashRef.current !== infoHash) {
    resumeHashRef.current = infoHash
    initialHistoryEntryRef.current = savedHistoryEntry
    playbackStartedRef.current = false
    stallCounterRef.current = 0
  }
  const playbackTitle = streamDisplayMetadata?.title.trim()
    || initialHistoryEntryRef.current?.title.trim()
    || torrent?.name
    || 'Unknown'
  const playbackPoster = streamDisplayMetadata?.posterUrl?.trim()
    || initialHistoryEntryRef.current?.poster.trim()
    || ''
  const playbackIdentity = useMemo(() => ({
    contentKey: streamDisplayMetadata?.contentKey,
    contentType: streamDisplayMetadata?.contentType,
    catalogId: streamDisplayMetadata?.catalogId,
    seriesId: streamDisplayMetadata?.seriesId,
    seriesTitle: streamDisplayMetadata?.seriesTitle,
    seriesImdbId: streamDisplayMetadata?.seriesImdbId,
    episodeId: streamDisplayMetadata?.episodeId,
    seasonNumber: streamDisplayMetadata?.seasonNumber,
    episodeNumber: streamDisplayMetadata?.episodeNumber,
    episodeTitle: streamDisplayMetadata?.episodeTitle
  }), [streamDisplayMetadata])

  const cancelQueuedRapidSkip = useCallback(() => {
    rapidSkipSchedulerRef.current?.cancel()
  }, [])

  useEffect(() => {
    setPhaseStartedAt(Date.now())
  }, [phase])

  useEffect(() => {
    setDownloadState('idle')
  }, [infoHash])

  useEffect(() => {
    if (streamError) {
      if (playbackStartedRef.current) {
        setLastPlaybackError(streamError)
        return
      }
      setError(streamError)
      setLoading(false)
    }
  }, [streamError])

  const handleRetry = useCallback(async (resumeFromOffset?: number) => {
    if (!infoHash) return
    cancelQueuedRapidSkip()
    setError(null)
    playbackStartedRef.current = false
    setLoading(true)
    setStreamURL(null)
    setMediaInfo(null)
    setSelectedAudioTrackIndex(null)
    setSelectedFileIndex(null)
    setManualFileSelectionComplete(false)
    // Preserve a recovery offset (e.g. mid-stream stall resume) if provided,
    // otherwise reset to start so normal retries always begin from the beginning.
    setPlaybackOffset(resumeFromOffset ?? 0)
    setPhase('connecting')
    connectionStartedAtRef.current = Date.now()
    setMediaProbeAttemptCount(0)
    setStreamURLAttemptCount(0)
    setLastSeekTarget(null)
    setLastPlaybackError(null)
    setVideoDiagnostics(null)
    seekRequestRef.current = 0
    playbackSessionRef.current = crypto.randomUUID()
    try {
      const retried = await retryStream(infoHash)
      if (retried.infoHash.toLowerCase() !== infoHash.toLowerCase()) {
        navigate(`/player/${retried.infoHash}`, { replace: true })
      } else {
        setConnectionAttempt((attempt) => attempt + 1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry the stream')
      setLoading(false)
    }
  }, [cancelQueuedRapidSkip, infoHash, navigate, retryStream])

  useEffect(() => {
    if (!streamError || !infoHash) return
    const candidates = streamDisplayMetadata?.sourceCandidates ?? []
    const index = streamDisplayMetadata?.sourceIndex ?? -1
    if (!shouldAutomaticallyFallback({
      enabled: playbackSettings.automaticSourceFallback,
      playbackStarted: playbackStartedRef.current,
      currentSourceIndex: index,
      sourceCount: candidates.length,
      alreadyAttempted: fallbackAttemptedRef.current === infoHash
    })) return
    fallbackAttemptedRef.current = infoHash
    setFallbackToast('Primary source failed. Switching to next best source...')
    const timer = setTimeout(() => setFallbackToast(null), 4000)
    void handleRetry()
    return () => clearTimeout(timer)
  }, [handleRetry, infoHash, playbackSettings.automaticSourceFallback, streamDisplayMetadata, streamError])

  // Proactive Stream Health Monitor: Detect dead swarms or unrecoverable mid-stream stalls
  useEffect(() => {
    if (!infoHash || !playbackSettings.automaticSourceFallback) return

    const candidates = streamDisplayMetadata?.sourceCandidates ?? []
    const index = streamDisplayMetadata?.sourceIndex ?? -1
    const hasMoreSources = index >= 0 && index + 1 < candidates.length
    if (!hasMoreSources) return

    const interval = setInterval(() => {
      const isConnecting = phase === 'connecting' || phase === 'metadata'
      const isBufferingOrStalled = phase === 'buffering' || phase === 'stalled'
      const downloadSpeed = prog?.downloadSpeed ?? 0
      const numPeers = prog?.numPeers ?? 0

      // Case 1: Initial startup stall (no peers or metadata for 20+ seconds)
      if (isConnecting && !playbackStartedRef.current) {
        const elapsed = (Date.now() - connectionStartedAtRef.current) / 1000
        if (elapsed >= 22 && downloadSpeed === 0 && numPeers === 0) {
          if (fallbackAttemptedRef.current !== infoHash) {
            fallbackAttemptedRef.current = infoHash
            setFallbackToast('Initial source unresponsive. Switching to next best source...')
            setTimeout(() => setFallbackToast(null), 4000)
            void handleRetry()
          }
        }
      }

      // Case 2: Mid-stream unrecoverable stall (playback started, but frozen with 0 B/s for 12+ consecutive seconds)
      if (playbackStartedRef.current && isBufferingOrStalled && downloadSpeed === 0) {
        stallCounterRef.current += 1
        if (stallCounterRef.current >= 12 && fallbackAttemptedRef.current !== infoHash) {
          fallbackAttemptedRef.current = infoHash
          const resumeAt = currentPlaybackTimeRef.current > 0 ? currentPlaybackTimeRef.current : undefined
          setFallbackToast('Stream stalled. Recovering on next best source...')
          setTimeout(() => setFallbackToast(null), 4000)
          void handleRetry(resumeAt)
        }
      } else {
        stallCounterRef.current = 0
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [handleRetry, infoHash, phase, playbackSettings.automaticSourceFallback, prog?.downloadSpeed, prog?.numPeers, streamDisplayMetadata])

  const handlePlaybackStateChange = useCallback((state: ConnectionPhase) => {
    if (state === 'playing') {
      playbackStartedRef.current = true
      setError(null)
    }
    setPhase(state)
  }, [])

  const handleQueueDownload = useCallback(async () => {
    if (!streamMagnet || downloadState === 'queueing' || downloadState === 'queued' || downloadState === 'started') return
    setDownloadState('queueing')
    try {
      const result = await window.torrentAPI.queueDownload(streamMagnet, infoHash)
      setDownloadState(result.queued ? 'queued' : 'started')
    } catch (downloadError) {
      console.error('[Player] Failed to queue download:', downloadError)
      setDownloadState('error')
    }
  }, [downloadState, infoHash, streamMagnet])

  const handleCancelConnection = useCallback(() => {
    cancelQueuedRapidSkip()
    isCancellingRef.current = true
    if (infoHash) {
      cancelScheduledStreamCleanup(infoHash)
      void cleanupStream(infoHash)
    }
    navigate(-1)
  }, [cancelQueuedRapidSkip, cleanupStream, infoHash, navigate])
  // Video file extensions for the file selector
  const videoExts = useMemo(() => new Set([
    // Modern containers
    'mp4', 'mkv', 'webm', 'mov', 'm4v',
    // Legacy / common in torrents
    'avi', 'wmv', 'flv', 'ts', 'ogv', 'm2ts', 'mts',
    'mpg', 'mpeg', '3gp', '3g2', 'divx',
    'vob', 'rmvb', 'rm', 'asf'
  ]), [])

  const videoFiles = useMemo(() => {
    if (!torrent?.files) return []
    return torrent.files
      .map((f, i) => ({ ...f, index: i }))
      .filter((f) => {
        const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
        return videoExts.has(ext)
      })
  }, [torrent?.files, videoExts])

  // Separate subtitle files included beside the video.
  const subtitleExts = useMemo(() => new Set(['vtt', 'srt', 'ass', 'ssa']), [])

  const sidecarSubtitleTracks = useMemo<SubtitleTrack[]>(() => {
    if (!torrent?.files) return []
    const streamBase = torrent.streamURL || (torrent ? `media://stream/${torrent.infoHash}` : '')

    return torrent.files
      .map((f, i) => ({ ...f, index: i }))
      .filter((f) => {
        const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
        return subtitleExts.has(ext)
      })
      .map((f) => ({
        label: f.name.split('/').pop() ?? f.name,
        preferenceKey: 'sidecar:' + (f.name.split('/').pop() ?? f.name),
        src: `${streamBase}/${f.index}`
      }))
  }, [torrent?.files, torrent?.infoHash, torrent?.streamURL, subtitleExts])

  // Embedded MKV/MP4 subtitle streams. Text tracks are converted to short
  // WebVTT windows; bitmap tracks remain visible but disabled with a reason.
  const embeddedSubtitleTracks = useMemo<SubtitleTrack[]>(() => {
    if (!torrent || !mediaInfo) return []
    const streamBase = torrent.streamURL || `media://stream/${torrent.infoHash}`

    return [...mediaInfo.subtitleTracks]
      .sort((left, right) => Number(right.textBased) - Number(left.textBased)
        || Number(right.isDefault) - Number(left.isDefault))
      .map((track) => ({
        label: subtitleTrackLabel(track),
        preferenceKey: track.language !== 'und' ? 'language:' + track.language : 'embedded:' + track.index,
        isDefault: track.isDefault,
        ...(track.textBased
          ? {
              windowSrc: (startSeconds: number, durationSeconds: number) =>
                `${streamBase}/subtitle/${track.index}?start=${startSeconds.toFixed(3)}`
                + `&duration=${durationSeconds.toFixed(3)}`
            }
          : {
              unsupportedReason: `${track.codec.toUpperCase()} is an image subtitle format. Text rendering is unavailable.`
            })
      }))
  }, [mediaInfo, torrent])

  const subtitleTracks = useMemo(
    () => [...onlineSubtitleTracks, ...embeddedSubtitleTracks, ...sidecarSubtitleTracks],
    [embeddedSubtitleTracks, onlineSubtitleTracks, sidecarSubtitleTracks]
  )

  useEffect(() => () => {
    for (const track of onlineSubtitleTracks) {
      if (track.src?.startsWith('blob:')) URL.revokeObjectURL(track.src)
    }
  }, [onlineSubtitleTracks])

  const searchOnlineSubtitleTracks = useCallback(async () => {
    if (!playbackSettings.openSubtitlesApiKey) {
      setOnlineSubtitleError('Add your OpenSubtitles API key in Settings first.')
      setShowOnlineSubtitles(true)
      return
    }
    setShowOnlineSubtitles(true)
    setOnlineSubtitleLoading(true)
    setOnlineSubtitleError(null)
    try {
      const results = await window.torrentAPI.searchOnlineSubtitles({
        apiKey: playbackSettings.openSubtitlesApiKey,
        query: streamDisplayMetadata?.seriesTitle || playbackTitle,
        language: playbackSettings.preferredSubtitleLanguage,
        seasonNumber: streamDisplayMetadata?.seasonNumber,
        episodeNumber: streamDisplayMetadata?.episodeNumber
      })
      setOnlineSubtitleResults(results)
      if (results.length === 0) setOnlineSubtitleError('No matching online subtitles were found.')
    } catch (subtitleError) {
      setOnlineSubtitleError(subtitleError instanceof Error ? subtitleError.message : 'Online subtitle search failed.')
    } finally {
      setOnlineSubtitleLoading(false)
    }
  }, [playbackSettings.openSubtitlesApiKey, playbackSettings.preferredSubtitleLanguage, playbackTitle, streamDisplayMetadata])

  const addOnlineSubtitleTrack = useCallback(async (result: OnlineSubtitleResult) => {
    setOnlineSubtitleLoading(true)
    setOnlineSubtitleError(null)
    try {
      const content = await window.torrentAPI.downloadOnlineSubtitle(playbackSettings.openSubtitlesApiKey, result.fileId)
      const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
      try {
        localStorage.setItem('streamforge.playback.subtitlesEnabled', 'true')
        localStorage.setItem('streamforge.playback.subtitleTrack', `online:${result.fileId}`)
      } catch {
        // The selected track still works for this session.
      }
      setOnlineSubtitleTracks([{
        label: `${result.language.toUpperCase()} · ${result.fileName}`,
        preferenceKey: `online:${result.fileId}`,
        src: url,
        isDefault: true
      }])
      setShowOnlineSubtitles(false)
    } catch (subtitleError) {
      setOnlineSubtitleError(subtitleError instanceof Error ? subtitleError.message : 'Subtitle download failed.')
    } finally {
      setOnlineSubtitleLoading(false)
    }
  }, [playbackSettings.openSubtitlesApiKey])
  // Fetch stream URL - retry if the torrent isn't ready yet
  useEffect(() => {
    if (!infoHash) return
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout>
    let mediaInfoTimer: ReturnType<typeof setTimeout>

    let mediaInfoAttempts = 0
    let streamURLAttempts = 0
    setPhase(torrent ? 'metadata' : 'connecting')

    const refreshMediaInfo = async (): Promise<PlayerMediaInfo | null> => {
      try {
        mediaInfoAttempts++
        setMediaProbeAttemptCount(mediaInfoAttempts)
        const info = await window.torrentAPI.getMediaInfo(infoHash)
        console.log('[Player] Got media info:', info)
        if (!cancelled) {
          setMediaInfo(info)
          if (info) setPhase(info.needsTranscode ? 'transcoding' : 'buffering')
        }
        if ((!info || info.duration <= 0) && !cancelled && mediaInfoAttempts < 8) {
          mediaInfoTimer = setTimeout(refreshMediaInfo, 5_000)
        }
        return info
      } catch (error) {
        console.warn('[Player] Media info unavailable; retrying:', error)
        if (!cancelled && mediaInfoAttempts < 8) {
          mediaInfoTimer = setTimeout(refreshMediaInfo, 5_000)
        }
        return null
      }
    }

    const fetchURL = async () => {
      try {
        streamURLAttempts++
        setStreamURLAttemptCount(streamURLAttempts)
        if (streamURLAttempts > 30) {
          setError('The stream did not become ready within 45 seconds. Retry or choose another source.')
          setLoading(false)
          return
        }
        // Wait until the torrent is actually ready in the store
        // (metadata resolved, file selected, stream server can serve it)
        const found = torrent?.ready
          ? torrent
          : (await window.torrentAPI.getTorrents()).find((candidate) => candidate.infoHash === infoHash)

        if (!found || !found.ready) {
          setPhase(found ? 'metadata' : 'connecting')
          console.log('[Player] Torrent not ready yet, retrying in 1.5s...')
          if (!cancelled) {
            retryTimer = setTimeout(fetchURL, 1500)
          }
          return
        }

        setSelectedFileIndex(found.requiresFileSelection ? null : found.selectedFileIndex)
        if (found.requiresFileSelection) {
          setShowFileSelector(true)
          setLoading(false)
          setPhase('metadata')
          return
        }

        setPhase('probing')
        console.log('[Player] Torrent ready, fetching stream URL and media info for', infoHash)
        const [url, info] = await Promise.all([
          window.torrentAPI.getStreamURL(infoHash),
          refreshMediaInfo()
        ])
        console.log('[Player] Got stream URL:', url)
        if (!cancelled && url) {
          const requestId = ++seekRequestRef.current
          const selectedAudio = info ? choosePreferredAudioTrack(info) : null
          const resumeTime = info
            ? getPlaybackResumeTime(initialHistoryEntryRef.current, info.duration)
            : 0
          if (resumeTime > 0 && infoHash && info) {
            await Promise.all([
              window.torrentAPI.notifySeek(infoHash, resumeTime / info.duration),
              window.torrentAPI.updatePlaybackPosition(infoHash, resumeTime, info.duration)
            ])
          }
          setSelectedAudioTrackIndex(selectedAudio)
          setPlaybackOffset(resumeTime)
          currentPlaybackTimeRef.current = resumeTime
          setResumeNoticeTime(resumeTime > 0 ? resumeTime : null)
          setStreamURL(buildPlaybackURL(url, playbackSessionRef.current, requestId, {
            start: resumeTime > 0 ? resumeTime : undefined,
            audioTrack: info && info.audioTracks.length > 1 ? selectedAudio ?? undefined : undefined
          }))
          setLoading(false)
          setError(null)
          setLastPlaybackError(null)
          setPhase('buffering')
        }

      } catch (err) {
        console.warn('[Player] Stream URL not ready, retrying in 2s...', err)
        if (!cancelled) {
          retryTimer = setTimeout(fetchURL, 2000)
        }
      }
    }

    fetchURL()
    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      clearTimeout(mediaInfoTimer)
    }
  }, [infoHash, connectionAttempt, torrent?.ready])

  // Cleanup stream data only after a real navigation. The scheduler lives at
  // module scope, so a React StrictMode remount can cancel the previous
  // component instance's pending cleanup.
  const torrentModeRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    torrentModeRef.current = torrent?.mode
  }, [torrent?.mode])

  useEffect(() => {
    if (!infoHash) return
    cancelScheduledStreamCleanup(infoHash)

    return () => {
      const hash = infoHash
      if (!isCancellingRef.current && torrentModeRef.current === 'stream') {
        scheduleStreamCleanup(hash, () => {
          console.log('[Player] Left player - cleaning up stream:', hash)
          return useTorrentStore.getState().cleanupStream(hash)
        })
      }
    }
  }, [infoHash])
  // File selection handler
  const handleFileSelect = useCallback(
    async (fileIndex: number) => {
      if (!infoHash) return
      cancelQueuedRapidSkip()
      setLoading(true)
      setShowFileSelector(false)
      try {
        const url = await window.torrentAPI.selectFile(infoHash, fileIndex)
        const info = await window.torrentAPI.getMediaInfo(infoHash)
        setSelectedFileIndex(fileIndex)
        setManualFileSelectionComplete(true)
        setResumeNoticeTime(null)
        setMediaInfo(info)
        const selectedAudio = info ? choosePreferredAudioTrack(info) : null
        setSelectedAudioTrackIndex(selectedAudio)
        const requestId = ++seekRequestRef.current
        setPlaybackOffset(0)
        setStreamURL(buildPlaybackURL(url, playbackSessionRef.current, requestId, {
          audioTrack: info && info.audioTracks.length > 1 ? selectedAudio ?? undefined : undefined
        }))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to select file')
      } finally {
        setLoading(false)
      }
    },
    [cancelQueuedRapidSkip, infoHash]
  )

  // Compatibility streams restart only when the destination is outside the
  // browser's current buffer. Native streams and short buffered skips seek in place.
  const restartPlaybackAt = useCallback(
    async (
      currentTime: number,
      audioTrackIndex: number | null,
      reservedRequestId?: number
    ) => {
      if (!infoHash || !torrent) return
      const duration = mediaInfo?.duration
      if (!duration || duration <= 0 || !Number.isFinite(duration)) return

      const target = Math.max(0, Math.min(currentTime, Math.max(0, duration - 0.25)))
      const positionPercent = target / duration
      const requestId = reservedRequestId ?? ++seekRequestRef.current
      console.log(`[Player] Restart at ${target.toFixed(1)}s with audio track ${audioTrackIndex ?? 'default'}`)

      try {
        await Promise.all([
          window.torrentAPI.notifySeek(infoHash, positionPercent),
          window.torrentAPI.updatePlaybackPosition(infoHash, target, duration)
        ])
        if (requestId !== seekRequestRef.current) return

        const baseURL = await window.torrentAPI.getStreamURL(infoHash)
        if (requestId !== seekRequestRef.current) return

        setPlaybackOffset(target)
        setPhase('buffering')
        setStreamURL(buildPlaybackURL(baseURL, playbackSessionRef.current, requestId, {
          start: target,
          audioTrack: audioTrackIndex ?? undefined
        }))
      } catch (seekError) {
        console.error('[Player] Playback restart failed:', seekError)
        throw seekError
      }
    },
    [infoHash, torrent, mediaInfo]
  )

  // Skip-button bursts reserve a generation immediately, but defer expensive
  // torrent reprioritization and FFmpeg startup until the final target settles.
  const restartAfterRapidSkip = useCallback(
    (currentTime: number, audioTrackIndex: number | null): Promise<void> => {
      cancelQueuedRapidSkip()
      const requestId = ++seekRequestRef.current
      return rapidSkipSchedulerRef.current!.schedule(
        () => restartPlaybackAt(currentTime, audioTrackIndex, requestId)
      )
    },
    [cancelQueuedRapidSkip, restartPlaybackAt]
  )

  useEffect(() => () => cancelQueuedRapidSkip(), [cancelQueuedRapidSkip])

  const handleSeeking = useCallback(
    async (currentTime: number, request: PlaybackSeekRequest) => {
      setResumeNoticeTime(null)
      setLastSeekTarget(currentTime)
      if (request.requiresRestart) {
        if (request.origin === 'skip') {
          await restartAfterRapidSkip(currentTime, selectedAudioTrackIndex)
        } else {
          cancelQueuedRapidSkip()
          await restartPlaybackAt(currentTime, selectedAudioTrackIndex)
        }
        return
      }

      cancelQueuedRapidSkip()
      const duration = mediaInfo?.duration
      if (!infoHash || !duration || duration <= 0 || !Number.isFinite(duration)) return
      const target = Math.max(0, Math.min(currentTime, Math.max(0, duration - 0.25)))
      const requestId = ++seekRequestRef.current
      await Promise.all([
        window.torrentAPI.notifySeek(infoHash, target / duration),
        window.torrentAPI.updatePlaybackPosition(infoHash, target, duration)
      ])
      if (requestId !== seekRequestRef.current) return
    },
    [cancelQueuedRapidSkip, infoHash, mediaInfo?.duration, restartAfterRapidSkip, restartPlaybackAt, selectedAudioTrackIndex]
  )

  const handleAudioTrackChange = useCallback(
    async (audioTrackIndex: number) => {
      const track = mediaInfo?.audioTracks.find((candidate) => candidate.index === audioTrackIndex)
      if (!track) return
      cancelQueuedRapidSkip()
      setSelectedAudioTrackIndex(audioTrackIndex)
      try {
        localStorage.setItem(PREFERRED_AUDIO_LANGUAGE_KEY, track.language)
      } catch {
        // Playback continues even if preferences cannot be stored.
      }
      await restartPlaybackAt(currentPlaybackTimeRef.current, audioTrackIndex)
    },
    [cancelQueuedRapidSkip, mediaInfo, restartPlaybackAt]
  )

  // History tracking
  const addToHistory = useUserDataStore((s) => s.addToHistory)
  const lastHistoryUpdate = useRef(0)
  const lastPlaybackUpdate = useRef(0)

  // Add to history when stream starts
  useEffect(() => {
    if (!torrent || !streamURL) return
    addToHistory({
      movieId: torrent.infoHash,
      ...playbackIdentity,
      slug: torrent.infoHash,
      title: playbackTitle,
      poster: playbackPoster,
      progress: initialHistoryEntryRef.current?.progress ?? 0,
      currentTime: initialHistoryEntryRef.current?.currentTime,
      duration: initialHistoryEntryRef.current?.duration,
      magnetURI: streamMagnet
    })
  }, [torrent?.infoHash, streamURL, streamMagnet, playbackTitle, playbackPoster, playbackIdentity, addToHistory])

  // Persist an exact recovery point frequently enough to survive abrupt exits.
  const handleTimeUpdate = useCallback(
    (currentTime: number, duration: number) => {
      currentPlaybackTimeRef.current = currentTime
      setCurrentPlaybackTime(currentTime)
      if (!duration || !isFinite(duration)) return
      const now = Date.now()

      if (infoHash && now - lastPlaybackUpdate.current >= 1000) {
        lastPlaybackUpdate.current = now
        void window.torrentAPI.updatePlaybackPosition(infoHash, currentTime, duration)
      }

      if (!torrent || now - lastHistoryUpdate.current < 5000) return
      lastHistoryUpdate.current = now
      addToHistory({
        movieId: torrent.infoHash,
        ...playbackIdentity,
        slug: torrent.infoHash,
        title: playbackTitle,
        poster: playbackPoster,
        progress: currentTime / duration,
        currentTime,
        duration,
        magnetURI: streamMagnet
      })
    },
    [infoHash, torrent, streamMagnet, playbackTitle, playbackPoster, playbackIdentity, addToHistory]
  )

  const handlePlaybackEnded = useCallback(() => {
    setResumeNoticeTime(null)
    if (!torrent || !mediaInfo?.duration) return
    addToHistory({
      movieId: torrent.infoHash,
      ...playbackIdentity,
      slug: torrent.infoHash,
      title: playbackTitle,
      poster: playbackPoster,
      progress: 1,
      currentTime: mediaInfo.duration,
      duration: mediaInfo.duration,
      magnetURI: streamMagnet
    })
    if (streamDisplayMetadata?.nextEpisode) {
      setNextEpisodeError(null)
      setUpNextCountdown(playbackSettings.autoplayNextEpisode ? 10 : 0)
    }
  }, [addToHistory, mediaInfo?.duration, streamMagnet, torrent, playbackTitle, playbackPoster, playbackIdentity, playbackSettings.autoplayNextEpisode, streamDisplayMetadata?.nextEpisode])

  const prepareNextEpisode = useCallback(async (downloadOnly = false) => {
    const next = streamDisplayMetadata?.nextEpisode
    const seriesTitle = streamDisplayMetadata?.seriesTitle
    const seriesId = streamDisplayMetadata?.seriesId
    if (!next || !seriesTitle || !seriesId) return
    setNextEpisodeError(null)
    try {
      const response = await window.torrentAPI.searchEpisodeTorrents({
        seriesTitle,
        seasonNumber: next.seasonNumber,
        episodeNumber: next.episodeNumber,
        episodeTitle: next.title,
        imdbId: streamDisplayMetadata.seriesImdbId,
        seriesAliases: streamDisplayMetadata.seriesAliases,
        absoluteEpisodeNumber: next.absoluteEpisodeNumber,
        absoluteEpisodeOnly: streamDisplayMetadata.absoluteEpisodeOnly,
        torznabEndpoints: playbackSettings.torznabEnabled
          ? playbackSettings.torznabEndpoints.filter((endpoint) => endpoint.url.trim()).map((endpoint) => ({
            url: endpoint.url.trim(),
            ...(endpoint.apiKey.trim() ? { apiKey: endpoint.apiKey.trim() } : {})
          }))
          : undefined,
        stremioAddonUrls: playbackSettings.stremioAddonEnabled
          ? playbackSettings.stremioAddonUrls.map((url) => url.trim()).filter(Boolean)
          : undefined,
        torrentioEnabled: playbackSettings.torrentioEnabled
      })
      const ranked = rankSources(response.results, playbackSettings)
      if (ranked.length === 0) throw new Error('No exact source is available for the next episode.')
      const seasonEpisodes = await window.torrentAPI.getSeasonEpisodes(next.seasonId).catch(() => [])
      if (downloadOnly) {
        await addDownload(ranked[0].magnetURI)
        const upcoming = seasonEpisodes.filter((episode) => (
          episode.episodeNumber !== null
          && episode.seasonNumber === next.seasonNumber
          && episode.episodeNumber > next.episodeNumber
        )).slice(0, Math.max(0, playbackSettings.smartDownloadCount - 1))
        for (const episode of upcoming) {
          if (episode.episodeNumber === null) continue
          const upcomingResponse = await window.torrentAPI.searchEpisodeTorrents({
            seriesTitle,
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
            episodeTitle: episode.title,
            imdbId: streamDisplayMetadata.seriesImdbId,
            seriesAliases: streamDisplayMetadata.seriesAliases,
            absoluteEpisodeNumber: next.absoluteEpisodeNumber === undefined
              ? undefined
              : next.absoluteEpisodeNumber + (episode.episodeNumber - next.episodeNumber),
            absoluteEpisodeOnly: streamDisplayMetadata.absoluteEpisodeOnly,
            torznabEndpoints: playbackSettings.torznabEnabled
              ? playbackSettings.torznabEndpoints.filter((endpoint) => endpoint.url.trim()).map((endpoint) => ({
                url: endpoint.url.trim(),
                ...(endpoint.apiKey.trim() ? { apiKey: endpoint.apiKey.trim() } : {})
              }))
              : undefined,
            stremioAddonUrls: playbackSettings.stremioAddonEnabled
              ? playbackSettings.stremioAddonUrls.map((url) => url.trim()).filter(Boolean)
              : undefined,
            torrentioEnabled: playbackSettings.torrentioEnabled
          })
          const upcomingSources = rankSources(upcomingResponse.results, playbackSettings)
          if (upcomingSources[0]) await addDownload(upcomingSources[0].magnetURI)
        }
        smartDownloadedEpisodeRef.current = next.id
        return
      }

      const following = seasonEpisodes.find((episode) => (
        episode.episodeNumber !== null
        && episode.seasonNumber === next.seasonNumber
        && episode.episodeNumber === next.episodeNumber + 1
      ))
      const hash = extractInfoHash(ranked[0].magnetURI)
      if (!hash) throw new Error('The selected next-episode source is invalid.')
      void addTorrent(ranked[0].magnetURI, {
        seasonNumber: next.seasonNumber,
        episodeNumber: next.episodeNumber,
        fileIndex: ranked[0].fileIndex,
        absoluteEpisodeNumber: next.absoluteEpisodeNumber,
        absoluteEpisodeOnly: streamDisplayMetadata.absoluteEpisodeOnly,
        seriesTitles: streamDisplayMetadata.seriesAliases
      }, {
        title: `${seriesTitle} — ${streamDisplayMetadata.absoluteEpisodeOnly && next.absoluteEpisodeNumber !== undefined
          ? `EP ${String(next.absoluteEpisodeNumber).padStart(3, '0')}`
          : `S${String(next.seasonNumber).padStart(2, '0')}E${String(next.episodeNumber).padStart(2, '0')}`} ${next.title}`,
        posterUrl: next.stillUrl ?? streamDisplayMetadata.posterUrl,
        contentKey: `episode:tvmaze:${next.id}`,
        contentType: 'episode',
        catalogId: String(next.id),
        seriesId,
        seriesTitle,
        seriesImdbId: streamDisplayMetadata.seriesImdbId,
        seriesAliases: streamDisplayMetadata.seriesAliases,
        absoluteEpisodeOnly: streamDisplayMetadata.absoluteEpisodeOnly,
        episodeId: next.id,
        seasonNumber: next.seasonNumber,
        episodeNumber: next.episodeNumber,
        episodeTitle: next.title,
        nextEpisode: following && following.episodeNumber !== null ? {
          id: following.id,
          seasonId: following.seasonId,
          seasonNumber: following.seasonNumber,
          episodeNumber: following.episodeNumber,
          title: following.title,
          stillUrl: following.stillUrl,
          absoluteEpisodeNumber: next.absoluteEpisodeNumber === undefined
            ? undefined
            : next.absoluteEpisodeNumber + 1
        } : undefined,
        sourceCandidates: ranked,
        sourceIndex: 0
      }).catch((nextError) => setNextEpisodeError(nextError instanceof Error ? nextError.message : 'The next episode could not be started.'))
      setUpNextCountdown(null)
      navigate(`/player/${hash}`, { replace: true })
    } catch (nextError) {
      setNextEpisodeError(nextError instanceof Error ? nextError.message : 'The next episode could not be prepared.')
      setUpNextCountdown(0)
    }
  }, [addDownload, addTorrent, navigate, playbackSettings, streamDisplayMetadata])

  useEffect(() => {
    if (upNextCountdown === null || upNextCountdown <= 0 || !playbackSettings.autoplayNextEpisode) return
    const timer = window.setTimeout(() => {
      if (upNextCountdown === 1) void prepareNextEpisode(false)
      else setUpNextCountdown(upNextCountdown - 1)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [playbackSettings.autoplayNextEpisode, prepareNextEpisode, upNextCountdown])

  useEffect(() => {
    const nextId = streamDisplayMetadata?.nextEpisode?.id
    if (upNextCountdown === null || !nextId || playbackSettings.autoplayNextEpisode || !playbackSettings.smartDownloads) return
    if (smartDownloadedEpisodeRef.current === nextId) return
    void prepareNextEpisode(true)
  }, [playbackSettings.autoplayNextEpisode, playbackSettings.smartDownloads, prepareNextEpisode, streamDisplayMetadata?.nextEpisode?.id, upNextCountdown])

  const skippableChapter = useMemo(() => {
    if (!playbackSettings.skipChapterMarkers) return null
    return (mediaInfo?.chapters ?? []).find((chapter) => {
      const title = chapter.title?.toLowerCase() ?? ''
      return /intro|opening|credits|ending|outro/.test(title)
        && currentPlaybackTime >= Math.max(0, chapter.start - 2)
        && currentPlaybackTime < chapter.end - 1
    }) ?? null
  }, [currentPlaybackTime, mediaInfo?.chapters, playbackSettings.skipChapterMarkers])

  useEffect(() => {
    const persistRecoveryPoint = () => {
      const duration = mediaInfo?.duration ?? 0
      const currentTime = currentPlaybackTimeRef.current
      if (!torrent || duration <= 0 || currentTime <= 0) return
      addToHistory({
        movieId: torrent.infoHash,
        ...playbackIdentity,
        slug: torrent.infoHash,
        title: playbackTitle,
        poster: playbackPoster,
        progress: currentTime / duration,
        currentTime,
        duration,
        magnetURI: streamMagnet
      })
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persistRecoveryPoint()
    }
    window.addEventListener('beforeunload', persistRecoveryPoint)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      persistRecoveryPoint()
      window.removeEventListener('beforeunload', persistRecoveryPoint)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [addToHistory, mediaInfo?.duration, streamMagnet, torrent, playbackTitle, playbackPoster, playbackIdentity])

  const restartFromBeginning = useCallback(() => {
    setResumeNoticeTime(null)
    cancelQueuedRapidSkip()
    void restartPlaybackAt(0, selectedAudioTrackIndex)
  }, [cancelQueuedRapidSkip, restartPlaybackAt, selectedAudioTrackIndex])

  const handleVideoError = useCallback((playbackError: unknown) => {
    const message = playbackErrorMessage(playbackError)
    setLastPlaybackError(message)
    console.error('[Player] Video error:', playbackError)
  }, [])

  const diagnosticsReport = useMemo(() => buildPlaybackDiagnosticsReport({
    infoHash: infoHash || 'unknown',
    torrent,
    progress: prog,
    mediaInfo,
    streamURL,
    selectedFileIndex,
    selectedAudioTrackIndex,
    connection: {
      phase,
      startedAt: connectionStartedAtRef.current,
      phaseStartedAt,
      connectionAttempt,
      mediaProbeAttempts: mediaProbeAttemptCount,
      streamURLAttempts: streamURLAttemptCount,
      playbackRequest: seekRequestRef.current,
      lastSeekTarget
    },
    playback: videoDiagnostics,
    errors: [error, streamError, lastPlaybackError],
    userAgent: navigator.userAgent
  }), [connectionAttempt, error, infoHash, lastPlaybackError, lastSeekTarget, mediaInfo, mediaProbeAttemptCount, phase, phaseStartedAt, prog, selectedAudioTrackIndex, selectedFileIndex, streamError, streamURL, streamURLAttemptCount, torrent, videoDiagnostics])

  const diagnosticsControl = (
    <button
      onClick={() => setShowDiagnostics((visible) => !visible)}
      className="fixed bottom-4 right-4 z-30 flex h-9 items-center gap-2 rounded-lg border border-white/[0.09] bg-[#151719]/95 px-3 text-[10px] font-medium text-white/50 shadow-lg hover:bg-[#1b1e20] hover:text-white/75"
      aria-pressed={showDiagnostics}
      title="Open playback diagnostics"
    >
      <Activity className="h-3.5 w-3.5 text-teal-300/70" /> Diagnostics
    </button>
  )
  const diagnosticsPanel = showDiagnostics
    ? <PlaybackDiagnosticsPanel report={diagnosticsReport} onClose={() => setShowDiagnostics(false)} />
    : null
  // Loading state - show while waiting for torrent metadata + stream URL
  if (loading && !streamURL) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 animate-[fade-in_0.3s_ease-out]">
        {diagnosticsControl}
        {diagnosticsPanel}
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-bg-tertiary)] border-t-[var(--color-accent)]" />
        <p className="text-sm text-[var(--color-text-secondary)]">
          {PHASE_LABELS[phase]}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {prog ? `${prog.numPeers} connected` : 'Resolving metadata...'}
        </p>
        <button
          type="button"
          onClick={handleCancelConnection}
          className="mt-2 flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-white/[0.08] hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Cancel and go back
        </button>
      </div>
    )
  }

  // Error state
  if (error && !streamURL) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 animate-[fade-in_0.3s_ease-out]">
        {diagnosticsControl}
        {diagnosticsPanel}
        <p className="text-sm text-[var(--color-danger)]">{error}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleRetry()}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-110"
          >
            <RotateCcw className="h-4 w-4" />
            Retry connection
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-bg-tertiary)] px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-card-hover)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto animate-[fade-in_0.3s_ease-out]">
      {diagnosticsControl}
      {diagnosticsPanel}
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => navigate('/')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-all duration-200 hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {playbackTitle || 'Loading...'}
          </h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            {torrent ? formatBytes(torrent.totalSize) : '-'}
            {torrent?.files && torrent.files.length > 1
              ? ` · ${torrent.files.length} files`
              : ''}
          </p>
        </div>

        <button
          onClick={() => void handleQueueDownload()}
          disabled={!streamMagnet || downloadState === 'queueing' || downloadState === 'queued' || downloadState === 'started'}
          title={downloadState === 'queued' ? 'Download will start when you close this player' : 'Download this video'}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 text-[10px] text-white/45 hover:bg-white/[0.05] hover:text-white/75 disabled:cursor-default disabled:opacity-55"
        >
          <Download className="h-3.5 w-3.5" />
          {downloadState === 'queueing' ? 'Queuing...' : downloadState === 'queued' ? 'Queued' : downloadState === 'started' ? 'Downloading' : downloadState === 'error' ? 'Retry download' : 'Download'}
        </button>

        <div className="relative">
          <button onClick={() => void searchOnlineSubtitleTracks()} className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 text-[10px] text-white/45 hover:bg-white/[0.05] hover:text-white/75"><Captions className="h-3.5 w-3.5" /> Find subtitles</button>
          {showOnlineSubtitles && (
            <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-white/[0.1] bg-[#15181a] shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3"><div><p className="text-[10px] font-semibold text-white/65">Online subtitles</p><p className="mt-1 text-[8px] text-white/25">OpenSubtitles · {playbackSettings.preferredSubtitleLanguage.toUpperCase()}</p></div><button onClick={() => setShowOnlineSubtitles(false)} className="text-[10px] text-white/30 hover:text-white/70">Close</button></div>
              {onlineSubtitleLoading && <div className="px-4 py-6 text-center text-[10px] text-white/35">Loading subtitles…</div>}
              {!onlineSubtitleLoading && onlineSubtitleError && <div className="px-4 py-4 text-[9px] text-amber-200/65">{onlineSubtitleError}</div>}
              {!onlineSubtitleLoading && onlineSubtitleResults.length > 0 && <div className="max-h-72 divide-y divide-white/[0.05] overflow-y-auto">{onlineSubtitleResults.map((result) => <button key={`${result.id}:${result.fileId}`} onClick={() => void addOnlineSubtitleTrack(result)} className="block w-full px-4 py-3 text-left hover:bg-white/[0.04]"><p className="truncate text-[10px] text-white/62">{result.fileName}</p><p className="mt-1 text-[8px] text-white/25">{result.language.toUpperCase()} · {result.downloadCount.toLocaleString()} downloads{result.release ? ` · ${result.release}` : ''}</p></button>)}</div>}
            </div>
          )}
        </div>

        {/* File Selector */}
        {(videoFiles.length > 1 || (torrent?.requiresFileSelection && !manualFileSelectionComplete)) && (
          <div className="relative">
            <button
              onClick={() => setShowFileSelector(!showFileSelector)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)]"
            >
              <Film className="h-3.5 w-3.5" />
              <span>
                {selectedFileIndex !== null
                  ? videoFiles.find((f) => f.index === selectedFileIndex)?.name ?? 'Select File'
                  : 'Select File'}
              </span>
              <ChevronDown className={clsx('h-3 w-3 transition-transform', showFileSelector && 'rotate-180')} />
            </button>

            {showFileSelector && (
              <div className="glass-heavy absolute right-0 top-full z-20 mt-1 max-h-60 w-72 overflow-y-auto rounded-xl p-1 shadow-xl animate-[scale-in_0.15s_ease-out]">
                {videoFiles.map((file) => (
                  <button
                    key={file.index}
                    onClick={() => handleFileSelect(file.index)}
                    className={clsx(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors',
                      file.index === selectedFileIndex
                        ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]'
                    )}
                  >
                    <Film className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{file.name}</span>
                    <span className="ml-auto shrink-0 text-[var(--color-text-muted)]">
                      {formatBytes(file.size)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Video Player */}
      <div className="relative px-4">
        {torrent?.requiresFileSelection && !manualFileSelectionComplete && !streamURL && (
          <div className="mb-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100/70" role="alert">
            {torrent.fileSelectionMessage || 'Choose the requested episode file to continue.'}
          </div>
        )}
        {phase !== 'playing' && streamURL && (
          <div className="mb-2 rounded-lg bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
            {PHASE_LABELS[phase]}
          </div>
        )}
        {streamURL && (
          <>
        {fallbackToast && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] font-medium text-amber-200 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-amber-400"></span>
            <span>{fallbackToast}</span>
          </div>
        )}
        {resumeNoticeTime !== null && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-teal-300/15 bg-teal-300/[0.06] px-3 py-2 text-[11px] text-white/62">
            <span>Resumed from {formatResumeTime(resumeNoticeTime)}</span>
            <div className="flex items-center gap-3">
              <button onClick={restartFromBeginning} className="font-medium text-teal-200/75 hover:text-teal-100">Start over</button>
              <button onClick={() => setResumeNoticeTime(null)} className="text-white/35 hover:text-white/65">Dismiss</button>
            </div>
          </div>
        )}
          <VideoPlayer
            src={streamURL}
            durationOverride={mediaInfo?.duration ?? 0}
            seekable={!!mediaInfo && mediaInfo.duration > 0}
            restartOnSeek
            timelineOffset={playbackOffset}
            audioTracks={mediaInfo?.audioTracks ?? []}
            selectedAudioTrackIndex={selectedAudioTrackIndex}
            onAudioTrackChange={handleAudioTrackChange}
            onSeeking={handleSeeking}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handlePlaybackEnded}
            onError={handleVideoError}
            onPlaybackStateChange={handlePlaybackStateChange}
            onDiagnosticsChange={setVideoDiagnostics}
            subtitleTracks={subtitleTracks}
            connectionStats={{
              downloadSpeed: prog?.downloadSpeed ?? 0,
              numPeers: prog?.numPeers ?? 0,
              downloadedProgress: prog?.bufferProgress ?? 0
            }}
          >
            {skippableChapter && (
              <button
                onClick={() => void restartPlaybackAt(skippableChapter.end, selectedAudioTrackIndex)}
                className="absolute bottom-7 right-8 z-20 flex items-center gap-2 rounded-lg border border-white/20 bg-black/75 px-4 py-2 text-[11px] font-semibold text-white shadow-xl backdrop-blur hover:bg-white hover:text-black"
              >
                Skip {/(credits|ending|outro)/i.test(skippableChapter.title ?? '') ? 'credits' : 'intro'} <SkipForward className="h-3.5 w-3.5" />
              </button>
            )}
            {upNextCountdown !== null && streamDisplayMetadata?.nextEpisode && (
              <div className="absolute inset-x-8 bottom-7 z-20 flex items-center gap-4 rounded-xl border border-white/15 bg-[#111416]/95 p-4 shadow-2xl backdrop-blur">
                {streamDisplayMetadata.nextEpisode.stillUrl && <img src={streamDisplayMetadata.nextEpisode.stillUrl} alt="" className="h-16 w-28 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-teal-200/60">Up Next</p><p className="mt-1 truncate text-[12px] font-semibold text-white/80">{streamDisplayMetadata.absoluteEpisodeOnly && streamDisplayMetadata.nextEpisode.absoluteEpisodeNumber !== undefined ? `EP ${String(streamDisplayMetadata.nextEpisode.absoluteEpisodeNumber).padStart(3, '0')}` : `S${streamDisplayMetadata.nextEpisode.seasonNumber} E${streamDisplayMetadata.nextEpisode.episodeNumber}`} · {streamDisplayMetadata.nextEpisode.title}</p>{nextEpisodeError ? <p className="mt-1 text-[9px] text-red-200/65">{nextEpisodeError}</p> : playbackSettings.autoplayNextEpisode && upNextCountdown > 0 ? <p className="mt-1 text-[9px] text-white/32">Playing in {upNextCountdown} seconds</p> : null}</div>
                <button onClick={() => setUpNextCountdown(null)} className="rounded-lg border border-white/[0.1] px-3 py-2 text-[10px] text-white/45 hover:bg-white/[0.06]">Cancel</button>
                <button onClick={() => void prepareNextEpisode(false)} className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-[10px] font-semibold text-[#17191b]"><Play className="h-3 w-3 fill-current" /> Play now</button>
              </div>
            )}
          </VideoPlayer>
          </>
        )}
      </div>

      {/* Torrent Info Overlay */}
      <div className="space-y-3 px-4 py-4">
        {/* Health Bar */}
        <TorrentHealth
          numPeers={prog?.numPeers ?? 0}
          downloadSpeed={prog?.downloadSpeed ?? 0}
          uploadSpeed={prog?.uploadSpeed ?? 0}
          ratio={prog?.ratio ?? 0}
        />
      </div>
    </div>
  )
}
