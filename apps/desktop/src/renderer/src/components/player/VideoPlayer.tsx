import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  getLocalPlaybackTime,
  getUnclampedLocalSeekTime,
  isAbsolutePlaybackTimeBuffered,
  isPlaybackTimeAtRequestedSeek
} from '../../lib/playback-seek'
import type { VideoElementDiagnostics } from '../../lib/playback-diagnostics'
import { findActiveSubtitleCue, parseSubtitles, type SubtitleCue } from '../../lib/subtitle-policy'
import { formatSpeed } from '../../lib/utils'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  Subtitles,
  AudioLines,
  Upload,
  Loader2,
  RotateCcw,
  RotateCw,
  Gauge,
  Globe2,
  Keyboard,
  PictureInPicture2,
  Users
} from 'lucide-react'

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface SubtitleTrack {
  label: string
  preferenceKey?: string
  src?: string
  content?: string
  windowSrc?: (startSeconds: number, durationSeconds: number) => string
  unsupportedReason?: string
  isDefault?: boolean
}

interface AudioTrack {
  index: number
  codec: string
  language: string
  title: string | null
  channels: number
  channelLayout: string | null
  isDefault: boolean
}

export type PlaybackState = 'buffering' | 'playing' | 'stalled'

export interface PlaybackSeekRequest {
  requiresRestart: boolean
  origin: 'timeline' | 'skip'
}

export interface StreamingConnectionStats {
  downloadSpeed: number
  numPeers: number
  downloadedProgress: number
}

interface VideoPlayerProps {
  src: string
  durationOverride?: number | null
  seekable?: boolean
  restartOnSeek?: boolean
  timelineOffset?: number
  onReady?: () => void
  onSeeking?: (currentTime: number, request: PlaybackSeekRequest) => void | Promise<void>
  onTimeUpdate?: (currentTime: number, duration: number) => void
  onEnded?: () => void
  onError?: (error: unknown) => void
  onPlaybackStateChange?: (state: PlaybackState) => void
  onDiagnosticsChange?: (diagnostics: VideoElementDiagnostics) => void
  audioTracks?: AudioTrack[]
  selectedAudioTrackIndex?: number | null
  onAudioTrackChange?: (trackIndex: number) => void | Promise<void>
  subtitleTracks?: SubtitleTrack[]
  connectionStats?: StreamingConnectionStats
  children?: React.ReactNode
}


// ———————————————————————————————————————————— Helpers ——————————————————————————

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

const CONTROLS_HIDE_DELAY = 3000
const VOLUME_KEY = 'streamforge.playback.volume'
const SUBTITLE_OFFSET_KEY = 'streamforge.playback.subtitleOffset'
const SUBTITLE_SCALE_KEY = 'streamforge.playback.subtitleScale'
const SUBTITLE_TRACK_KEY = 'streamforge.playback.subtitleTrack'
const SUBTITLES_ENABLED_KEY = 'streamforge.playback.subtitlesEnabled'
const PLAYBACK_RATE_KEY = 'streamforge.playback.rate'
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const SUBTITLE_WINDOW_STRIDE_SECONDS = 15
const SUBTITLE_WINDOW_DURATION_SECONDS = 30
const SUBTITLE_WINDOW_PREROLL_SECONDS = 5

function loadStoredNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const value = Number.parseFloat(localStorage.getItem(key) || '')
    return Number.isFinite(value) ? clamp(value, min, max) : fallback
  } catch {
    return fallback
  }
}

function storeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Playback preferences are optional.
  }
}

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function VideoPlayer({
  src,
  durationOverride,
  seekable = true,
  restartOnSeek = false,
  timelineOffset = 0,
  onSeeking,
  onTimeUpdate,
  onEnded,
  onError,
  onPlaybackStateChange,
  onDiagnosticsChange,
  audioTracks = [],
  selectedAudioTrackIndex = null,
  onAudioTrackChange,
  subtitleTracks = [],
  connectionStats,
  children
}: VideoPlayerProps) {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const volumeRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seekOperationRef = useRef(0)
  const pendingSeekTimeRef = useRef<number | null>(null)
  const resumeAfterReloadRef = useRef<number | null>(null)
  const subtitleFileInputRef = useRef<HTMLInputElement>(null)

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const sourceDuration = typeof durationOverride === 'number' && Number.isFinite(durationOverride)
    ? Math.max(0, durationOverride)
    : null
  const effectiveDuration = sourceDuration ?? duration
  const [buffered, setBuffered] = useState(0)
  const [bufferedRanges, setBufferedRanges] = useState<Array<{ start: number; end: number }>>([])
  const [isBuffering, setIsBuffering] = useState(false)
  const [waitingForPiecesAt, setWaitingForPiecesAt] = useState<number | null>(null)
  const [lastPlaybackEvent, setLastPlaybackEvent] = useState('created')
  const [loadRetryCount, setLoadRetryCount] = useState(0)

  // Volume state
  const [volume, setVolume] = useState(() => loadStoredNumber(VOLUME_KEY, 1, 0, 1))
  const [isMuted, setIsMuted] = useState(false)
  const [prevVolume, setPrevVolume] = useState(() => loadStoredNumber(VOLUME_KEY, 1, 0, 1))

  // UI state
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSeeking, setIsSeeking] = useState(false)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverX, setHoverX] = useState(0)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [showAudioMenu, setShowAudioMenu] = useState(false)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [showShortcutHelp, setShowShortcutHelp] = useState(false)
  const [showConnectionMenu, setShowConnectionMenu] = useState(false)
  const [isPictureInPicture, setIsPictureInPicture] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(() => loadStoredNumber(PLAYBACK_RATE_KEY, 1, 0.5, 2))

  // Subtitle state
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([])
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false)
  const [subtitleLoading, setSubtitleLoading] = useState(false)
  const [subtitleError, setSubtitleError] = useState<string | null>(null)
  const [activeSubTrackIdx, setActiveSubTrackIdx] = useState(0)
  const [showSubMenu, setShowSubMenu] = useState(false)
  const [externalSubtitleTracks, setExternalSubtitleTracks] = useState<SubtitleTrack[]>([])
  const [subtitleOffset, setSubtitleOffset] = useState(() => loadStoredNumber(SUBTITLE_OFFSET_KEY, 0, -30, 30))
  const [subtitleScale, setSubtitleScale] = useState(() => loadStoredNumber(SUBTITLE_SCALE_KEY, 1, 0.75, 1.5))
  const allSubtitleTracks = useMemo(
    () => [...subtitleTracks, ...externalSubtitleTracks],
    [subtitleTracks, externalSubtitleTracks]
  )
  const activeSubtitleTrack = allSubtitleTracks[activeSubTrackIdx]

  useEffect(() => {
    if (allSubtitleTracks.length === 0) return
    let preferredTrack = ''
    let enabled = false
    try {
      preferredTrack = localStorage.getItem(SUBTITLE_TRACK_KEY) || ''
      enabled = localStorage.getItem(SUBTITLES_ENABLED_KEY) === 'true'
    } catch {
      // Preferences remain optional.
    }

    const preferredIndex = preferredTrack
      ? allSubtitleTracks.findIndex((track) => (track.preferenceKey || track.label) === preferredTrack)
      : -1
    const defaultIndex = allSubtitleTracks.findIndex((track) => track.isDefault && !track.unsupportedReason)
    const nextIndex = preferredIndex >= 0 ? preferredIndex : defaultIndex >= 0 ? defaultIndex : 0
    setActiveSubTrackIdx(nextIndex)
    setSubtitlesEnabled(enabled && !allSubtitleTracks[nextIndex]?.unsupportedReason)
  }, [allSubtitleTracks])

  const subtitleWindowStart = activeSubtitleTrack?.windowSrc
    ? Math.max(
        0,
        Math.floor(currentTime / SUBTITLE_WINDOW_STRIDE_SECONDS) * SUBTITLE_WINDOW_STRIDE_SECONDS
          - SUBTITLE_WINDOW_PREROLL_SECONDS
      )
    : 0

  // Large center play button (shown once on initial load, and when paused by click)
  const [showCenterPlay, setShowCenterPlay] = useState(true)

  // â”€â”€â”€ Controls Auto-Hide â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false)
        setShowSubMenu(false)
        setShowAudioMenu(false)
        setShowSpeedMenu(false)
        setShowShortcutHelp(false)
        setShowConnectionMenu(false)
        setShowVolumeSlider(false)
      }
    }, CONTROLS_HIDE_DELAY)
  }, [])

  const handleMouseMove = useCallback(() => {
    resetHideTimer()
  }, [resetHideTimer])

  const handleMouseLeave = useCallback(() => {
    if (videoRef.current && !videoRef.current.paused) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => {
        setShowControls(false)
        setShowSubMenu(false)
        setShowAudioMenu(false)
        setShowSpeedMenu(false)
        setShowShortcutHelp(false)
        setShowConnectionMenu(false)
        setShowVolumeSlider(false)
      }, 800)
    }
  }, [])

  // â”€â”€â”€ Playback Controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => {})
      setShowCenterPlay(false)
    } else {
      video.pause()
      setShowCenterPlay(true)
    }
  }, [])

  const seek = useCallback(
    (time: number, origin: PlaybackSeekRequest['origin'] = 'timeline') => {
      const video = videoRef.current
      if (!video || !seekable) return

      const target = clamp(time, 0, effectiveDuration || video.duration || 0)
      // Chromium may report only the currently generated compatibility fragment
      // as video.duration. Clamping to it turns a 50-minute request back into the
      // old stream endpoint, so retain the full timeline target here.
      const localTarget = getUnclampedLocalSeekTime(target, timelineOffset)
      const targetIsBuffered = isAbsolutePlaybackTimeBuffered(
        target,
        timelineOffset,
        Array.from({ length: video.buffered.length }, (_, index) => ({
          start: video.buffered.start(index),
          end: video.buffered.end(index)
        }))
      )
      const requiresRestart = restartOnSeek && !targetIsBuffered
      const operation = ++seekOperationRef.current
      pendingSeekTimeRef.current = target
      setCurrentTime(target)
      setWaitingForPiecesAt(targetIsBuffered ? null : target)
      setIsBuffering(true)
      onPlaybackStateChange?.('buffering')

      void Promise.resolve(onSeeking?.(target, { requiresRestart, origin }))
        .then(() => {
          if (operation !== seekOperationRef.current || requiresRestart) return
          // Prioritize the target torrent pieces before Chromium requests them.
          video.currentTime = localTarget
        })
        .catch((error) => {
          if (operation !== seekOperationRef.current) return
          pendingSeekTimeRef.current = null
          setWaitingForPiecesAt(null)
          setIsBuffering(false)
          onError?.(error)
        })
    },
    [effectiveDuration, onError, onPlaybackStateChange, onSeeking, restartOnSeek, seekable, timelineOffset]
  )

  const skipBy = useCallback((seconds: number) => {
    if (!seekable) return
    const video = videoRef.current
    const activeTime = pendingSeekTimeRef.current
      ?? (video && Number.isFinite(video.currentTime) ? timelineOffset + video.currentTime : currentTime)
    seek(activeTime + seconds, 'skip')
    resetHideTimer()
  }, [currentTime, resetHideTimer, seek, seekable, timelineOffset])

  const changeVolume = useCallback((v: number) => {
    const video = videoRef.current
    if (!video) return
    const clamped = clamp(v, 0, 1)
    video.volume = clamped
    setVolume(clamped)
    storeNumber(VOLUME_KEY, clamped)
    if (clamped > 0) {
      setIsMuted(false)
      video.muted = false
    }
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (isMuted) {
      video.muted = false
      setIsMuted(false)
      const restoreVol = prevVolume > 0 ? prevVolume : 0.5
      video.volume = restoreVol
      setVolume(restoreVol)
    } else {
      setPrevVolume(volume)
      video.muted = true
      setIsMuted(true)
    }
  }, [isMuted, prevVolume, volume])

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      container.requestFullscreen()
    }
  }, [])

  const changePlaybackRate = useCallback((rate: number) => {
    const nextRate = PLAYBACK_RATES.reduce((closest, option) =>
      Math.abs(option - rate) < Math.abs(closest - rate) ? option : closest
    )
    setPlaybackRate(nextRate)
    storeNumber(PLAYBACK_RATE_KEY, nextRate)
    if (videoRef.current) videoRef.current.playbackRate = nextRate
    setShowSpeedMenu(false)
  }, [])

  const stepPlaybackRate = useCallback((direction: -1 | 1) => {
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate)
    const nextIndex = clamp(currentIndex + direction, 0, PLAYBACK_RATES.length - 1)
    changePlaybackRate(PLAYBACK_RATES[nextIndex])
    resetHideTimer()
  }, [changePlaybackRate, playbackRate, resetHideTimer])

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current
    if (!video || !document.pictureInPictureEnabled) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await video.requestPictureInPicture()
      }
    } catch (error) {
      console.warn('[VideoPlayer] Picture-in-picture unavailable:', error)
    }
  }, [])

  // â”€â”€â”€ Progress Bar Interaction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const getProgressFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const bar = progressRef.current
      if (!bar) return 0
      const rect = bar.getBoundingClientRect()
      return clamp((e.clientX - rect.left) / rect.width, 0, 1)
    },
    []
  )

  const handleProgressMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      if (!seekable) return
      setIsSeeking(true)
      let pendingTime = getProgressFromEvent(e) * (effectiveDuration || 0)
      setCurrentTime(pendingTime)

      const handleDrag = (ev: MouseEvent) => {
        pendingTime = getProgressFromEvent(ev) * (effectiveDuration || 0)
        setCurrentTime(pendingTime)
      }

      const handleUp = () => {
        seek(pendingTime)
        setIsSeeking(false)
        window.removeEventListener('mousemove', handleDrag)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleDrag)
      window.addEventListener('mouseup', handleUp)
    },
    [effectiveDuration, getProgressFromEvent, seek, seekable]
  )

  const handleProgressHover = useCallback(
    (e: React.MouseEvent) => {
      const bar = progressRef.current
      if (!bar) return
      const rect = bar.getBoundingClientRect()
      const pct = clamp((e.clientX - rect.left) / rect.width, 0, 1)
      setHoverTime(pct * (effectiveDuration || 0))
      setHoverX(e.clientX - rect.left)
    },
    [effectiveDuration]
  )

  const handleProgressLeave = useCallback(() => {
    setHoverTime(null)
  }, [])

  // â”€â”€â”€ Volume Slider Interaction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const getVolumeFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    const bar = volumeRef.current
    if (!bar) return 0
    const rect = bar.getBoundingClientRect()
    return clamp((e.clientX - rect.left) / rect.width, 0, 1)
  }, [])

  const handleVolumeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const v = getVolumeFromEvent(e)
      changeVolume(v)

      const handleDrag = (ev: MouseEvent) => {
        const vol = getVolumeFromEvent(ev)
        changeVolume(vol)
      }

      const handleUp = () => {
        window.removeEventListener('mousemove', handleDrag)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleDrag)
      window.addEventListener('mouseup', handleUp)
    },
    [getVolumeFromEvent, changeVolume]
  )

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = volume
    video.muted = isMuted
    video.playbackRate = playbackRate
  }, [src, volume, isMuted, playbackRate])

  useEffect(() => {
    setCurrentTime(timelineOffset)
    setBuffered(0)
    setBufferedRanges([])
    setWaitingForPiecesAt(pendingSeekTimeRef.current)
    setIsBuffering(true)
    setLastPlaybackEvent('source-changed')
    setLoadRetryCount(0)
  }, [src, timelineOffset])

  // â”€â”€â”€ Video Event Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handlePlay = () => {
      setLastPlaybackEvent('play')
      setIsPlaying(true)
      setShowCenterPlay(false)
      resetHideTimer()
    }
    const handlePause = () => {
      setLastPlaybackEvent('pause')
      setIsPlaying(false)
      setShowControls(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
    const handleTimeUpdateEvt = () => {
      const absoluteTime = timelineOffset + video.currentTime
      const requestedTime = pendingSeekTimeRef.current
      // The previous source can continue emitting events while the main process
      // reprioritizes pieces and creates the replacement URL. Do not let those
      // events snap the timeline or torrent priority back to the old time.
      if (requestedTime !== null && !isPlaybackTimeAtRequestedSeek(absoluteTime, requestedTime)) {
        const resolvedDuration = sourceDuration ?? (Number.isFinite(video.duration) ? video.duration : 0)
        setDuration(resolvedDuration)
        return
      }
      if (!isSeeking) {
        setCurrentTime(absoluteTime)
      }
      if (requestedTime !== null) {
        pendingSeekTimeRef.current = null
        resumeAfterReloadRef.current = null
        setWaitingForPiecesAt(null)
      }
      const resolvedDuration = sourceDuration ?? (Number.isFinite(video.duration) ? video.duration : 0)
      setDuration(resolvedDuration)
      onTimeUpdate?.(absoluteTime, resolvedDuration)
    }
    const handleProgress = () => {
      setLastPlaybackEvent('progress')
      const ranges = Array.from({ length: video.buffered.length }, (_, index) => ({
        start: timelineOffset + video.buffered.start(index),
        end: timelineOffset + video.buffered.end(index)
      }))
      setBufferedRanges(ranges)
      setBuffered(ranges.reduce((furthest, range) => Math.max(furthest, range.end), timelineOffset))
    }
    const handleSeekingEvt = () => {
      setLastPlaybackEvent('seeking')
      setIsBuffering(true)
      onPlaybackStateChange?.('buffering')
    }
    const handleEndedEvt = () => {
      setLastPlaybackEvent('ended')
      setIsPlaying(false)
      setShowControls(true)
      setShowCenterPlay(true)
      onEnded?.()
    }
    const retryRef = { count: 0, timer: null as ReturnType<typeof setTimeout> | null }
    const handleErrorEvt = () => {
      setLastPlaybackEvent('error')
      const err = video.error
      console.error('[VideoPlayer] Error:', err?.code, err?.message)
      onError?.(err)

      // Retry loading on error (stream might not have enough data yet)
      // MediaError codes: 1=ABORTED, 2=NETWORK, 3=DECODE, 4=SRC_NOT_SUPPORTED
      if (retryRef.count < 10 && err?.code !== 4) {
        const currentAbsoluteTime = timelineOffset + (Number.isFinite(video.currentTime) ? video.currentTime : 0)
        resumeAfterReloadRef.current = pendingSeekTimeRef.current ?? currentAbsoluteTime
        retryRef.count++
        setLoadRetryCount(retryRef.count)
        console.log(`[VideoPlayer] Retrying load (attempt ${retryRef.count})...`)
        retryRef.timer = setTimeout(() => {
          if (video && src) {
            video.src = src
            video.load()
          }
        }, 2000)
      }
    }
    const handleLoadedMetadata = () => {
      setLastPlaybackEvent('loadedmetadata')
      const resolvedDuration = sourceDuration ?? (Number.isFinite(video.duration) ? video.duration : 0)
      setDuration(resolvedDuration)

      const resumeTime = resumeAfterReloadRef.current
      if (!restartOnSeek && resumeTime !== null && Number.isFinite(video.duration)) {
        const localTime = getLocalPlaybackTime(resumeTime, timelineOffset, video.duration)
        if (localTime > 0.25) video.currentTime = localTime
      }
    }
    const handleCanPlay = () => {
      setLastPlaybackEvent('canplay')
      console.log('[VideoPlayer] Can play, attempting autoplay...')
      video.play().catch((e) => console.warn('[VideoPlayer] Autoplay blocked:', e))
    }
    const handleWaiting = () => {
      setLastPlaybackEvent('waiting')
      if (pendingSeekTimeRef.current !== null) setWaitingForPiecesAt(pendingSeekTimeRef.current)
      setIsBuffering(true)
      onPlaybackStateChange?.('buffering')
    }
    const handlePlaying = () => {
      const requestedTime = pendingSeekTimeRef.current
      const absoluteTime = timelineOffset + video.currentTime
      if (requestedTime !== null && !isPlaybackTimeAtRequestedSeek(absoluteTime, requestedTime)) return
      retryRef.count = 0
      setLoadRetryCount(0)
      setLastPlaybackEvent('playing')
      setWaitingForPiecesAt(null)
      setIsBuffering(false)
      onPlaybackStateChange?.('playing')
    }
    const handleCanPlayThrough = () => {
      const requestedTime = pendingSeekTimeRef.current
      const absoluteTime = timelineOffset + video.currentTime
      if (requestedTime !== null && !isPlaybackTimeAtRequestedSeek(absoluteTime, requestedTime)) return
      setLastPlaybackEvent('canplaythrough')
      setIsBuffering(false)
    }
    const handleStalled = () => {
      setLastPlaybackEvent('stalled')
      console.warn('[VideoPlayer] Stalled â€” stream may be buffering')
      setIsBuffering(true)
      onPlaybackStateChange?.('stalled')
    }

    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('timeupdate', handleTimeUpdateEvt)
    video.addEventListener('progress', handleProgress)
    video.addEventListener('seeking', handleSeekingEvt)
    video.addEventListener('ended', handleEndedEvt)
    video.addEventListener('error', handleErrorEvt)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('canplaythrough', handleCanPlayThrough)
    video.addEventListener('stalled', handleStalled)

    return () => {
      if (retryRef.timer) clearTimeout(retryRef.timer)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('timeupdate', handleTimeUpdateEvt)
      video.removeEventListener('progress', handleProgress)
      video.removeEventListener('seeking', handleSeekingEvt)
      video.removeEventListener('ended', handleEndedEvt)
      video.removeEventListener('error', handleErrorEvt)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('canplaythrough', handleCanPlayThrough)
      video.removeEventListener('stalled', handleStalled)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, sourceDuration, timelineOffset, restartOnSeek, onSeeking, onTimeUpdate, onEnded, onError, onPlaybackStateChange])

  // Chromium silently plays video with no sound when it cannot decode the audio codec
  // (e.g. AC3/DTS) - no error event fires. Detect it from the decoder byte counters so
  // the user gets a visible warning instead of a silent failure.
  const [silentAudioWarning, setSilentAudioWarning] = useState(false)
  const audioTrackCount = audioTracks.length
  useEffect(() => {
    setSilentAudioWarning(false)
    const video = videoRef.current as (HTMLVideoElement & {
      webkitAudioDecodedByteCount?: number
      webkitVideoDecodedByteCount?: number
    }) | null
    if (!video || audioTrackCount === 0) return

    let playingSince: number | null = null
    const timer = setInterval(() => {
      const idle = video.paused || video.ended || video.seeking || video.readyState < 3
      if (idle || video.muted || video.volume === 0) {
        playingSince = null
        return
      }
      if (playingSince === null) playingSince = Date.now()
      if (Date.now() - playingSince < 5000) return

      const audioBytes = video.webkitAudioDecodedByteCount
      const videoBytes = video.webkitVideoDecodedByteCount
      if (typeof audioBytes !== 'number' || typeof videoBytes !== 'number') return
      setSilentAudioWarning(audioBytes === 0 && videoBytes > 0)
    }, 1000)
    return () => clearInterval(timer)
  }, [src, audioTrackCount])

  // â”€â”€â”€ Fullscreen Change Listener â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    const video = videoRef.current
    if (!video || !onDiagnosticsChange) return

    const bufferedRanges = Array.from({ length: video.buffered.length }, (_, index) => ({
      start: timelineOffset + video.buffered.start(index),
      end: timelineOffset + video.buffered.end(index)
    }))
    const activeRange = bufferedRanges.find((range) => (
      currentTime >= range.start - 0.25 && currentTime <= range.end + 0.25
    ))

    onDiagnosticsChange({
      currentTime,
      duration: effectiveDuration,
      bufferedAhead: activeRange ? Math.max(0, activeRange.end - currentTime) : 0,
      bufferedRanges,
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      seeking: video.seeking || isSeeking,
      buffering: isBuffering,
      lastEvent: lastPlaybackEvent,
      loadRetryCount,
      timelineOffset
    })
  }, [buffered, currentTime, effectiveDuration, isBuffering, isPlaying, isSeeking, lastPlaybackEvent, loadRetryCount, onDiagnosticsChange, timelineOffset])
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const entered = () => setIsPictureInPicture(true)
    const left = () => setIsPictureInPicture(false)
    video.addEventListener('enterpictureinpicture', entered)
    video.addEventListener('leavepictureinpicture', left)
    return () => {
      video.removeEventListener('enterpictureinpicture', entered)
      video.removeEventListener('leavepictureinpicture', left)
    }
  }, [src])

  // â”€â”€â”€ Keyboard Shortcuts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing into an input
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const video = videoRef.current
      if (!video) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault()
          skipBy(-10)
          break
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault()
          skipBy(10)
          break
        case 'k':
        case 'K':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowUp':
          e.preventDefault()
          changeVolume(volume + 0.1)
          resetHideTimer()
          break
        case 'ArrowDown':
          e.preventDefault()
          changeVolume(volume - 0.1)
          resetHideTimer()
          break
        case 'f':
        case 'F':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'm':
        case 'M':
          e.preventDefault()
          toggleMute()
          resetHideTimer()
          break
        case 'c':
        case 'C': {
          if (allSubtitleTracks.length === 0) break
          const enabled = !subtitlesEnabled
          setSubtitlesEnabled(enabled)
          try { localStorage.setItem(SUBTITLES_ENABLED_KEY, String(enabled)) } catch {}
          resetHideTimer()
          break
        }
        case 'p':
        case 'P':
          e.preventDefault()
          void togglePictureInPicture()
          break
        case '>':
          e.preventDefault()
          stepPlaybackRate(1)
          break
        case '<':
          e.preventDefault()
          stepPlaybackRate(-1)
          break
        case '?':
          e.preventDefault()
          setShowShortcutHelp((visible) => !visible)
          setShowConnectionMenu(false)
          resetHideTimer()
          break
        case 'Escape':
          setShowShortcutHelp(false)
          setShowSpeedMenu(false)
          setShowConnectionMenu(false)
          if (document.fullscreenElement) {
            document.exitFullscreen()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [allSubtitleTracks.length, changeVolume, resetHideTimer, skipBy, stepPlaybackRate, subtitlesEnabled, toggleFullscreen, toggleMute, togglePictureInPicture, togglePlay, volume])

  // â”€â”€â”€ Subtitle Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    if (!subtitlesEnabled || !activeSubtitleTrack) {
      setSubtitleCues([])
      setSubtitleLoading(false)
      setSubtitleError(null)
      return
    }
    if (activeSubtitleTrack.unsupportedReason) {
      setSubtitleCues([])
      setSubtitleLoading(false)
      setSubtitleError(activeSubtitleTrack.unsupportedReason)
      return
    }

    const controller = new AbortController()
    setSubtitleCues([])
    setSubtitleLoading(true)
    setSubtitleError(null)

    const loadSubtitles = async (): Promise<SubtitleCue[]> => {
      if (activeSubtitleTrack.content !== undefined) {
        return parseSubtitles(activeSubtitleTrack.content)
      }

      const source = activeSubtitleTrack.windowSrc
        ? activeSubtitleTrack.windowSrc(subtitleWindowStart, SUBTITLE_WINDOW_DURATION_SECONDS)
        : activeSubtitleTrack.src
      if (!source) throw new Error('Subtitle track has no source')

      const response = await fetch(source, { signal: controller.signal })
      if (!response.ok) {
        let message = `Subtitle request failed (${response.status})`
        try {
          const payload = await response.json() as { error?: string }
          if (payload.error) message = payload.error
        } catch {
          // The response may be plain text.
        }
        throw new Error(message)
      }

      const text = await response.text()
      const cues = parseSubtitles(text)
      return activeSubtitleTrack.windowSrc
        ? cues.filter((cue) =>
            cue.end >= subtitleWindowStart
            && cue.start <= subtitleWindowStart + SUBTITLE_WINDOW_DURATION_SECONDS
          )
        : cues
    }

    void loadSubtitles()
      .then((cues) => {
        if (!controller.signal.aborted) setSubtitleCues(cues)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : 'Failed to load subtitles'
        console.warn('[VideoPlayer] Failed to load subtitles:', error)
        setSubtitleCues([])
        setSubtitleError(message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setSubtitleLoading(false)
      })

    return () => controller.abort()
  }, [activeSubtitleTrack, subtitlesEnabled, subtitleWindowStart])
  const handleExternalSubtitle = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const content = await file.text()
      const nextTrack: SubtitleTrack = { label: file.name, preferenceKey: 'local:' + file.name, content }
      setExternalSubtitleTracks((tracks) => [...tracks, nextTrack])
      setActiveSubTrackIdx(allSubtitleTracks.length)
      setSubtitlesEnabled(true)
      try {
        localStorage.setItem(SUBTITLE_TRACK_KEY, nextTrack.preferenceKey || nextTrack.label)
        localStorage.setItem(SUBTITLES_ENABLED_KEY, 'true')
      } catch {}
    } catch (error) {
      onError?.(error)
    }
  }, [allSubtitleTracks.length, onError])

  const adjustSubtitleOffset = useCallback((delta: number) => {
    setSubtitleOffset((current) => {
      const next = clamp(Math.round((current + delta) * 10) / 10, -30, 30)
      storeNumber(SUBTITLE_OFFSET_KEY, next)
      return next
    })
  }, [])

  const changeSubtitleScale = useCallback((scale: number) => {
    const next = clamp(scale, 0.75, 1.5)
    setSubtitleScale(next)
    storeNumber(SUBTITLE_SCALE_KEY, next)
  }, [])

  // â”€â”€â”€ Active Subtitle Cue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const activeCue = useMemo(() => {
    if (!subtitlesEnabled || subtitleCues.length === 0) return null
    return findActiveSubtitleCue(subtitleCues, currentTime, subtitleOffset)
  }, [subtitlesEnabled, subtitleCues, currentTime, subtitleOffset])

  // â”€â”€â”€ Derived Values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const progressPct = effectiveDuration > 0 ? (currentTime / effectiveDuration) * 100 : 0
  const downloadedPercentage = Math.round(
    clamp(connectionStats?.downloadedProgress ?? 0, 0, 1) * 100
  )
  const bufferedSegments = effectiveDuration > 0
    ? bufferedRanges.map((range) => ({
        left: clamp(range.start / effectiveDuration * 100, 0, 100),
        width: clamp((range.end - range.start) / effectiveDuration * 100, 0, 100)
      }))
    : []
  const pictureInPictureSupported = typeof document !== 'undefined'
    && document.pictureInPictureEnabled
    && typeof videoRef.current?.requestPictureInPicture === 'function'
  const effectiveVolume = isMuted ? 0 : volume

  const VolumeIcon = isMuted || effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2

  // â”€â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div
      ref={containerRef}
      className={clsx(
        'group relative w-full overflow-hidden rounded-xl bg-black',
        isFullscreen && 'h-screen rounded-none',
        showControls ? 'cursor-default' : 'cursor-none'
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={src}
        autoPlay
        className={clsx(
          'block w-full bg-black object-contain',
          isFullscreen && 'h-full'
        )}
        style={{ maxHeight: isFullscreen ? 'none' : '70vh' }}
        onClick={togglePlay}
      />

      {/* Buffering / seek feedback */}
      {isBuffering && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/15">
          <Loader2 className="h-10 w-10 animate-spin text-white/70" />
          <span className="rounded-full bg-black/70 px-3 py-1.5 text-[11px] font-medium text-white/75 backdrop-blur-sm">
            {waitingForPiecesAt !== null
              ? 'Waiting for pieces near ' + formatTime(waitingForPiecesAt)
              : 'Preparing playback...'}
          </span>
        </div>
      )}

      {silentAudioWarning && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-full border border-amber-400/30 bg-black/80 px-4 py-2 text-[12px] font-medium text-amber-200 shadow-lg backdrop-blur-sm">
          <VolumeX className="h-4 w-4 shrink-0" />
          <span>No audio is being played. This source's audio format may be unsupported - try another audio track or source.</span>
        </div>
      )}

      {/* Large Center Play Button */}
      <div
        className={clsx(
          'absolute inset-0 flex items-center justify-center transition-opacity duration-300',
          showCenterPlay && !isPlaying ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <button
          onClick={togglePlay}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-[var(--shadow-glow)] transition-transform duration-200 hover:scale-110 active:scale-95"
        >
          <Play className="ml-1 h-10 w-10" fill="currentColor" />
        </button>
      </div>

      {/* Subtitle Overlay */}
      {activeCue && (
        <div
          className={clsx(
            'pointer-events-none absolute inset-x-0 flex justify-center transition-all duration-200',
            showControls ? 'bottom-24' : 'bottom-8'
          )}
        >
          <span
            className="px-4 py-2 text-center leading-relaxed text-white"
            style={{
              fontSize: `${subtitleScale}rem`,
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.95), 0 0 2px rgba(0, 0, 0, 1)'
            }}
          >
            {activeCue.text.split('\n').map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
          </span>
        </div>
      )}

      {/* External overlays (skip intro, up-next, etc.) */}
      {children}

      {/* Controls Overlay */}
      <div
        className={clsx(
          'absolute inset-x-0 bottom-0 flex flex-col transition-all duration-300',
          showControls
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-4 opacity-0'
        )}
      >
        {/* Gradient backdrop */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

        {/* Progress Bar Area */}
        <div className="relative z-10 px-4 pt-6">
          <div
            ref={progressRef}
            className={clsx(
              'group/progress relative h-1.5 rounded-full bg-white/20 transition-all duration-200 hover:h-3',
              seekable ? 'cursor-pointer' : 'cursor-default'
            )}
            onMouseDown={seekable ? handleProgressMouseDown : undefined}
            title={!seekable ? 'Waiting for stable media duration' : restartOnSeek ? 'Long-distance seeking may rebuild the compatibility stream' : undefined}
            onMouseMove={handleProgressHover}
            onMouseLeave={handleProgressLeave}
          >
            {/* Chromium may expose several non-contiguous buffered ranges. */}
            {bufferedSegments.map((segment, index) => (
              <div
                key={index}
                className="absolute inset-y-0 rounded-full bg-white/30 transition-all duration-300"
                style={{ left: segment.left + '%', width: segment.width + '%' }}
              />
            ))}
            {/* Played Range */}
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all"
              style={{
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))'
              }}
            />

            {/* Seek Thumb */}
            <div
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-accent)] opacity-0 shadow-[var(--shadow-glow)] transition-opacity duration-200 group-hover/progress:opacity-100"
              style={{ left: `${progressPct}%` }}
            />

            {/* Hover Time Tooltip */}
            {hoverTime !== null && (
              <div
                className="absolute -top-9 -translate-x-1/2 rounded-md bg-black/90 px-2 py-1 text-xs font-medium text-white"
                style={{ left: `${hoverX}px` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>
        </div>

        {/* Control Bar */}
        <div className="player-controls relative z-10 flex items-center gap-2 px-4 py-3">
          {/* Skip backward */}
          <button
            onClick={() => skipBy(-10)}
            disabled={!seekable}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/90 transition-colors duration-200 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            title="Back 10 seconds (Left arrow or J)"
            aria-label="Skip backward 10 seconds"
          >
            <RotateCcw className="h-5 w-5" />
            <span className="absolute text-[8px] font-extrabold">10</span>
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/90 transition-colors duration-200 hover:bg-white/10 hover:text-white"
            title={isPlaying ? 'Pause (Space or K)' : 'Play (Space or K)'}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" fill="currentColor" />
            ) : (
              <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
            )}
          </button>

          {/* Skip forward */}
          <button
            onClick={() => skipBy(10)}
            disabled={!seekable}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/90 transition-colors duration-200 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            title="Forward 10 seconds (Right arrow or L)"
            aria-label="Skip forward 10 seconds"
          >
            <RotateCw className="h-5 w-5" />
            <span className="absolute text-[8px] font-extrabold">10</span>
          </button>

          {/* Volume */}
          <div
            className="relative flex items-center gap-1"
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
          >
            <button
              onClick={toggleMute}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/90 transition-colors duration-200 hover:bg-white/10 hover:text-white"
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            >
              <VolumeIcon className="h-5 w-5" />
            </button>

            {/* Volume Slider */}
            <div
              className={clsx(
                'flex items-center overflow-hidden transition-all duration-300',
                showVolumeSlider ? 'w-24 opacity-100' : 'w-0 opacity-0'
              )}
            >
              <div
                ref={volumeRef}
                className="h-1.5 w-full cursor-pointer rounded-full bg-white/20 transition-all duration-200 hover:h-2.5"
                onMouseDown={handleVolumeMouseDown}
              >
                <div
                  className="relative h-full rounded-full bg-white/90"
                  style={{ width: `${effectiveVolume * 100}%` }}
                >
                  <div className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 translate-x-1/2 rounded-full bg-white shadow-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* Time Display */}
          <span className="ml-1 select-none font-mono text-xs text-white/70">
            {formatTime(currentTime)}
            <span className="mx-1 text-white/40">/</span>
            {formatTime(effectiveDuration)}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Streaming connection */}
          <div className="relative">
            <button
              onClick={() => {
                setShowConnectionMenu((visible) => !visible)
                setShowAudioMenu(false)
                setShowSubMenu(false)
                setShowSpeedMenu(false)
                setShowShortcutHelp(false)
              }}
              className={clsx(
                'flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-white/10 hover:text-white',
                showConnectionMenu ? 'text-[var(--color-accent)]' : 'text-white/70'
              )}
              title="Streaming connection"
              aria-label="Streaming connection details"
              aria-expanded={showConnectionMenu}
            >
              <Globe2 className="h-5 w-5" />
            </button>

            {showConnectionMenu && (
              <div className="absolute bottom-12 right-0 w-64 overflow-hidden rounded-xl bg-black/90 shadow-xl backdrop-blur-xl">
                <div className="border-b border-white/10 px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Streaming connection</p>
                  <p className="mt-1 text-[10px] text-white/35">Live torrent activity</p>
                </div>
                <dl className="space-y-3 px-4 py-3 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-white/50">Download speed</dt>
                    <dd className="font-mono text-white/90">{formatSpeed(connectionStats?.downloadSpeed ?? 0)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="flex items-center gap-1.5 text-white/50"><Users className="h-3.5 w-3.5" /> Peers</dt>
                    <dd className="font-mono text-white/90">{connectionStats?.numPeers ?? 0}</dd>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <dt className="text-white/50">Video downloaded</dt>
                      <dd className="font-mono text-white/90">{downloadedPercentage}%</dd>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500"
                        style={{ width: `${downloadedPercentage}%` }}
                      />
                    </div>
                  </div>
                </dl>
              </div>
            )}
          </div>

          {/* Audio Tracks */}
          {audioTracks.length > 1 && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowAudioMenu((visible) => !visible)
                  setShowSubMenu(false)
                  setShowSpeedMenu(false)
                  setShowShortcutHelp(false)
                  setShowConnectionMenu(false)
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white"
                title="Audio track"
              >
                <AudioLines className="h-5 w-5" />
              </button>
              {showAudioMenu && (
                <div className="absolute bottom-12 right-0 min-w-[260px] overflow-hidden rounded-xl bg-black/90 py-1 shadow-xl backdrop-blur-xl">
                  <div className="border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                    Audio track
                  </div>
                  {audioTracks.map((track) => (
                    <button
                      key={track.index}
                      onClick={() => {
                        setShowAudioMenu(false)
                        void onAudioTrackChange?.(track.index)
                      }}
                      className={clsx(
                        'flex w-full items-center justify-between gap-4 px-4 py-2 text-left transition-colors',
                        selectedAudioTrackIndex === track.index
                          ? 'bg-white/10 text-[var(--color-accent)]'
                          : 'text-white/80 hover:bg-white/5 hover:text-white'
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm">
                          {track.title || (track.language === 'und' ? 'Unknown language' : track.language.toUpperCase())}
                          {track.isDefault ? ' Â· Default' : ''}
                        </span>
                        <span className="block text-[11px] text-white/45">
                          {track.codec.toUpperCase()} Â· {track.channelLayout || `${track.channels || '?'} channels`}
                        </span>
                      </span>
                      {selectedAudioTrackIndex === track.index && <span className="text-xs">Playing</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Subtitles */}
          <div className="relative">
            <input
              ref={subtitleFileInputRef}
              type="file"
              accept=".srt,.vtt,.ass,.ssa,text/vtt,application/x-subrip"
              className="hidden"
              onChange={handleExternalSubtitle}
            />
            <button
              onClick={() => {
                setShowSubMenu((visible) => !visible)
                setShowAudioMenu(false)
                setShowSpeedMenu(false)
                setShowShortcutHelp(false)
                setShowConnectionMenu(false)
              }}
              className={clsx(
                'flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-white/10',
                subtitlesEnabled
                  ? 'text-[var(--color-accent)]'
                  : 'text-white/70 hover:text-white'
              )}
              title="Subtitles (CC)"
            >
              <Subtitles className="h-5 w-5" />
            </button>

            {showSubMenu && (
              <div className="absolute bottom-12 right-0 w-72 overflow-hidden rounded-xl bg-black/90 py-1 shadow-xl backdrop-blur-xl">
                <div className="border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                  Subtitles
                </div>
                <button
                  onClick={() => {
                    setSubtitlesEnabled(false)
                    try { localStorage.setItem(SUBTITLES_ENABLED_KEY, 'false') } catch {}
                  }}
                  className={clsx(
                    'flex w-full items-center px-4 py-2 text-left text-sm transition-colors duration-150',
                    !subtitlesEnabled
                      ? 'bg-white/10 text-[var(--color-accent)]'
                      : 'text-white/80 hover:bg-white/5 hover:text-white'
                  )}
                >
                  Off
                </button>
                {allSubtitleTracks.length === 0 && (
                  <div className="px-4 py-2 text-xs text-white/45">No subtitle tracks found</div>
                )}
                {allSubtitleTracks.map((track, idx) => (
                  <button
                    key={`${track.label}-${idx}`}
                    disabled={!!track.unsupportedReason}
                    title={track.unsupportedReason}
                    onClick={() => {
                      if (track.unsupportedReason) return
                      setActiveSubTrackIdx(idx)
                      setSubtitlesEnabled(true)
                      try {
                        localStorage.setItem(SUBTITLE_TRACK_KEY, track.preferenceKey || track.label)
                        localStorage.setItem(SUBTITLES_ENABLED_KEY, 'true')
                      } catch {}
                    }}
                    className={clsx(
                      'flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors duration-150',
                      track.unsupportedReason
                        ? 'cursor-not-allowed text-white/30'
                        : subtitlesEnabled && activeSubTrackIdx === idx
                          ? 'bg-white/10 text-[var(--color-accent)]'
                          : 'text-white/80 hover:bg-white/5 hover:text-white'
                    )}
                  >
                    <span className="truncate">{track.label}</span>
                    {track.unsupportedReason && <span className="shrink-0 text-[10px] uppercase">Image</span>}
                  </button>
                ))}
                {subtitlesEnabled && subtitleLoading && (
                  <div className="flex items-center gap-2 px-4 py-2 text-xs text-white/55">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading subtitle windowâ€¦
                  </div>
                )}
                {subtitlesEnabled && subtitleError && (
                  <div className="px-4 py-2 text-xs text-amber-300">{subtitleError}</div>
                )}
                <button
                  onClick={() => subtitleFileInputRef.current?.click()}
                  className="flex w-full items-center gap-2 border-y border-white/10 px-4 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <Upload className="h-4 w-4" />
                  Load SRT, VTT, ASS or SSA file
                </button>
                <div className="space-y-3 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-white/60">Synchronization</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => adjustSubtitleOffset(-0.5)} className="rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20">âˆ’0.5s</button>
                      <button
                        onClick={() => {
                          setSubtitleOffset(0)
                          storeNumber(SUBTITLE_OFFSET_KEY, 0)
                        }}
                        className="min-w-14 rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
                      >
                        {subtitleOffset > 0 ? '+' : ''}{subtitleOffset.toFixed(1)}s
                      </button>
                      <button onClick={() => adjustSubtitleOffset(0.5)} className="rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20">+0.5s</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-white/60">Text size</span>
                    <div className="flex gap-1">
                      {[0.85, 1, 1.25].map((scale) => (
                        <button
                          key={scale}
                          onClick={() => changeSubtitleScale(scale)}
                          className={clsx(
                            'rounded px-2 py-1 text-xs',
                            subtitleScale === scale ? 'bg-[var(--color-accent)] text-white' : 'bg-white/10 text-white hover:bg-white/20'
                          )}
                        >
                          {Math.round(scale * 100)}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Playback speed */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSpeedMenu((visible) => !visible)
                setShowAudioMenu(false)
                setShowSubMenu(false)
                setShowShortcutHelp(false)
                setShowConnectionMenu(false)
              }}
              className="flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              title="Playback speed (< or >)"
              aria-label="Playback speed"
            >
              <Gauge className="h-4 w-4" />
              {playbackRate}x
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-12 right-0 min-w-[150px] overflow-hidden rounded-xl bg-black/90 py-1 shadow-xl backdrop-blur-xl">
                <div className="border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                  Playback speed
                </div>
                {PLAYBACK_RATES.map((rate) => (
                  <button
                    key={rate}
                    onClick={() => changePlaybackRate(rate)}
                    className={clsx(
                      'flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors',
                      playbackRate === rate
                        ? 'bg-white/10 text-[var(--color-accent)]'
                        : 'text-white/75 hover:bg-white/5 hover:text-white'
                    )}
                  >
                    <span>{rate}x</span>
                    {playbackRate === rate && <span className="text-[10px] uppercase">Active</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Picture in picture */}
          {pictureInPictureSupported && (
            <button
              onClick={() => void togglePictureInPicture()}
              className={clsx(
                'flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-white/10 hover:text-white',
                isPictureInPicture ? 'text-[var(--color-accent)]' : 'text-white/70'
              )}
              title={isPictureInPicture ? 'Exit picture-in-picture (P)' : 'Picture-in-picture (P)'}
              aria-label="Picture in picture"
            >
              <PictureInPicture2 className="h-5 w-5" />
            </button>
          )}

          {/* Keyboard shortcut help */}
          <div className="relative">
            <button
              onClick={() => {
                setShowShortcutHelp((visible) => !visible)
                setShowSpeedMenu(false)
                setShowAudioMenu(false)
                setShowSubMenu(false)
                setShowConnectionMenu(false)
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white"
              title="Keyboard shortcuts (?)"
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="h-5 w-5" />
            </button>
            {showShortcutHelp && (
              <div className="absolute bottom-12 right-0 w-72 rounded-xl bg-black/90 p-4 text-xs shadow-xl backdrop-blur-xl">
                <div className="mb-3 font-semibold uppercase tracking-wide text-white/50">Keyboard shortcuts</div>
                <div className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-2 text-white/65">
                  <span>Play / pause</span><kbd className="text-white/90">Space or K</kbd>
                  <span>Skip backward / forward</span><kbd className="text-white/90">J / L or arrows</kbd>
                  <span>Volume</span><kbd className="text-white/90">Up / Down</kbd>
                  <span>Mute</span><kbd className="text-white/90">M</kbd>
                  <span>Subtitles</span><kbd className="text-white/90">C</kbd>
                  <span>Playback speed</span><kbd className="text-white/90">&lt; / &gt;</kbd>
                  <span>Picture-in-picture</span><kbd className="text-white/90">P</kbd>
                  <span>Fullscreen</span><kbd className="text-white/90">F</kbd>
                </div>
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white"
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen (F)'}
          >
            {isFullscreen ? (
              <Minimize className="h-5 w-5" />
            ) : (
              <Maximize className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
