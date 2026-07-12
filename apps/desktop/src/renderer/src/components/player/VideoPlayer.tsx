import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  Subtitles,
  Loader2
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────

interface SubtitleTrack {
  label: string
  src: string
}

interface VideoPlayerProps {
  src: string
  onReady?: () => void
  onSeeking?: (currentTime: number) => void
  onTimeUpdate?: (currentTime: number, duration: number) => void
  onEnded?: () => void
  onError?: (error: unknown) => void
  subtitleTracks?: SubtitleTrack[]
}

interface SubtitleCue {
  start: number
  end: number
  text: string
}

// ─── Helpers ────────────────────────────────────────────

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

/** Parse SRT timestamp like "00:01:23,456" or VTT "00:01:23.456" → seconds */
function parseTimestamp(ts: string): number {
  const cleaned = ts.trim().replace(',', '.')
  const parts = cleaned.split(':')
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
  }
  return parseFloat(cleaned) || 0
}

/** Parse .srt or .vtt subtitle content into cues */
function parseSubtitles(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  // Normalise line endings
  const text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Split by double newline (blank line separates cues)
  const blocks = text.split(/\n\n+/)

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 2) continue

    // Find the line with the --> arrow (timestamp line)
    let tsIdx = lines.findIndex((l) => l.includes('-->'))
    if (tsIdx === -1) continue

    const tsParts = lines[tsIdx].split('-->')
    if (tsParts.length < 2) continue

    const start = parseTimestamp(tsParts[0])
    // Strip any position/style metadata after the timestamp
    const endRaw = tsParts[1].split(/\s+/)[0] || tsParts[1]
    const end = parseTimestamp(endRaw)

    // Everything after the timestamp line is text
    const cueText = lines
      .slice(tsIdx + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '') // Strip HTML tags
      .trim()

    if (cueText) {
      cues.push({ start, end, text: cueText })
    }
  }

  return cues
}

// ─── Constants ──────────────────────────────────────────

const CONTROLS_HIDE_DELAY = 3000

// ─── Component ──────────────────────────────────────────

export default function VideoPlayer({
  src,
  onSeeking,
  onTimeUpdate,
  onEnded,
  onError,
  subtitleTracks = []
}: VideoPlayerProps) {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const volumeRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [isBuffering, setIsBuffering] = useState(false)

  // Volume state
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [prevVolume, setPrevVolume] = useState(1)

  // UI state
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSeeking, setIsSeeking] = useState(false)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverX, setHoverX] = useState(0)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)

  // Subtitle state
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([])
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false)
  const [activeSubTrackIdx, setActiveSubTrackIdx] = useState(0)
  const [showSubMenu, setShowSubMenu] = useState(false)

  // Large center play button (shown once on initial load, and when paused by click)
  const [showCenterPlay, setShowCenterPlay] = useState(true)

  // ─── Controls Auto-Hide ──────────────────────────────

  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false)
        setShowSubMenu(false)
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
        setShowVolumeSlider(false)
      }, 800)
    }
  }, [])

  // ─── Playback Controls ───────────────────────────────

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
    (time: number) => {
      const video = videoRef.current
      if (!video) return
      const t = clamp(time, 0, video.duration || 0)
      video.currentTime = t
      setCurrentTime(t)
      onSeeking?.(t)
    },
    [onSeeking]
  )

  const changeVolume = useCallback((v: number) => {
    const video = videoRef.current
    if (!video) return
    const clamped = clamp(v, 0, 1)
    video.volume = clamped
    setVolume(clamped)
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

  // ─── Progress Bar Interaction ─────────────────────────

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
      setIsSeeking(true)
      const pct = getProgressFromEvent(e)
      const time = pct * (duration || 0)
      seek(time)

      const handleDrag = (ev: MouseEvent) => {
        const p = getProgressFromEvent(ev)
        const t = p * (duration || 0)
        seek(t)
      }

      const handleUp = () => {
        setIsSeeking(false)
        window.removeEventListener('mousemove', handleDrag)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleDrag)
      window.addEventListener('mouseup', handleUp)
    },
    [duration, getProgressFromEvent, seek]
  )

  const handleProgressHover = useCallback(
    (e: React.MouseEvent) => {
      const bar = progressRef.current
      if (!bar) return
      const rect = bar.getBoundingClientRect()
      const pct = clamp((e.clientX - rect.left) / rect.width, 0, 1)
      setHoverTime(pct * (duration || 0))
      setHoverX(e.clientX - rect.left)
    },
    [duration]
  )

  const handleProgressLeave = useCallback(() => {
    setHoverTime(null)
  }, [])

  // ─── Volume Slider Interaction ────────────────────────

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

  // ─── Video Event Handlers ────────────────────────────

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handlePlay = () => {
      setIsPlaying(true)
      setShowCenterPlay(false)
      resetHideTimer()
    }
    const handlePause = () => {
      setIsPlaying(false)
      setShowControls(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
    const handleTimeUpdateEvt = () => {
      if (!isSeeking) {
        setCurrentTime(video.currentTime)
      }
      setDuration(video.duration || 0)
      onTimeUpdate?.(video.currentTime, video.duration)
    }
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1))
      }
    }
    const handleSeekingEvt = () => onSeeking?.(video.currentTime)
    const handleEndedEvt = () => {
      setIsPlaying(false)
      setShowControls(true)
      setShowCenterPlay(true)
      onEnded?.()
    }
    const retryRef = { count: 0, timer: null as ReturnType<typeof setTimeout> | null }
    const handleErrorEvt = () => {
      const err = video.error
      console.error('[VideoPlayer] Error:', err?.code, err?.message)
      onError?.(err)

      // Retry loading on error (stream might not have enough data yet)
      // MediaError codes: 1=ABORTED, 2=NETWORK, 3=DECODE, 4=SRC_NOT_SUPPORTED
      if (retryRef.count < 10 && err?.code !== 4) {
        retryRef.count++
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
      setDuration(video.duration || 0)
      retryRef.count = 0 // Reset retry count on success
    }
    const handleCanPlay = () => {
      console.log('[VideoPlayer] Can play, attempting autoplay...')
      retryRef.count = 0 // Reset on success
      video.play().catch((e) => console.warn('[VideoPlayer] Autoplay blocked:', e))
    }
    const handleWaiting = () => setIsBuffering(true)
    const handlePlaying = () => setIsBuffering(false)
    const handleCanPlayThrough = () => setIsBuffering(false)
    const handleStalled = () => {
      console.warn('[VideoPlayer] Stalled — stream may be buffering')
      setIsBuffering(true)
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
  }, [src, onSeeking, onTimeUpdate, onEnded, onError])

  // ─── Fullscreen Change Listener ──────────────────────

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ─── Keyboard Shortcuts ──────────────────────────────

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
          e.preventDefault()
          seek(video.currentTime - 10)
          resetHideTimer()
          break
        case 'ArrowRight':
          e.preventDefault()
          seek(video.currentTime + 10)
          resetHideTimer()
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
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay, seek, changeVolume, toggleMute, toggleFullscreen, resetHideTimer, volume])

  // ─── Subtitle Loading ────────────────────────────────

  useEffect(() => {
    if (subtitleTracks.length === 0) {
      setSubtitleCues([])
      return
    }

    const track = subtitleTracks[activeSubTrackIdx]
    if (!track) return

    fetch(track.src)
      .then((r) => r.text())
      .then((text) => {
        const cues = parseSubtitles(text)
        setSubtitleCues(cues)
      })
      .catch((err) => {
        console.warn('[VideoPlayer] Failed to load subtitles:', err)
        setSubtitleCues([])
      })
  }, [subtitleTracks, activeSubTrackIdx])

  // ─── Active Subtitle Cue ─────────────────────────────

  const activeCue = useMemo(() => {
    if (!subtitlesEnabled || subtitleCues.length === 0) return null
    return (
      subtitleCues.find((cue) => currentTime >= cue.start && currentTime <= cue.end) ?? null
    )
  }, [subtitlesEnabled, subtitleCues, currentTime])

  // ─── Derived Values ──────────────────────────────────

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0
  const effectiveVolume = isMuted ? 0 : volume

  const VolumeIcon = isMuted || effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2

  // ─── Render ──────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={clsx(
        'group relative w-full overflow-hidden rounded-xl bg-black',
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
        className="block w-full"
        style={{ maxHeight: isFullscreen ? '100vh' : '70vh', backgroundColor: '#000' }}
        onClick={togglePlay}
      />

      {/* Buffering Spinner */}
      {isBuffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-white/70" />
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
          <span className="rounded-md bg-black/75 px-4 py-2 text-center text-base leading-relaxed text-white backdrop-blur-sm md:text-lg">
            {activeCue.text.split('\n').map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
          </span>
        </div>
      )}

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
            className="group/progress relative h-1.5 cursor-pointer rounded-full bg-white/20 transition-all duration-200 hover:h-3"
            onMouseDown={handleProgressMouseDown}
            onMouseMove={handleProgressHover}
            onMouseLeave={handleProgressLeave}
          >
            {/* Buffered Range */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/25 transition-all duration-300"
              style={{ width: `${bufferedPct}%` }}
            />

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
        <div className="relative z-10 flex items-center gap-2 px-4 py-3">
          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/90 transition-colors duration-200 hover:bg-white/10 hover:text-white"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" fill="currentColor" />
            ) : (
              <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
            )}
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
            {formatTime(duration)}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Subtitles Button */}
          {subtitleTracks.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowSubMenu((prev) => !prev)}
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

              {/* Subtitle Menu */}
              {showSubMenu && (
                <div className="absolute bottom-12 right-0 min-w-[160px] overflow-hidden rounded-xl bg-black/85 py-1 shadow-xl backdrop-blur-xl">
                  <button
                    onClick={() => {
                      setSubtitlesEnabled(false)
                      setShowSubMenu(false)
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
                  {subtitleTracks.map((track, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setActiveSubTrackIdx(idx)
                        setSubtitlesEnabled(true)
                        setShowSubMenu(false)
                      }}
                      className={clsx(
                        'flex w-full items-center px-4 py-2 text-left text-sm transition-colors duration-150',
                        subtitlesEnabled && activeSubTrackIdx === idx
                          ? 'bg-white/10 text-[var(--color-accent)]'
                          : 'text-white/80 hover:bg-white/5 hover:text-white'
                      )}
                    >
                      {track.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
