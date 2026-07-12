import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Film, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import VideoPlayer from '../components/player/VideoPlayer'
import BufferIndicator from '../components/player/BufferIndicator'
import TorrentHealth from '../components/player/TorrentHealth'
import { useTorrentStore } from '../stores/torrentStore'
import { useUserDataStore } from '../stores/userDataStore'
import { formatBytes } from '../lib/utils'

export default function Player() {
  const { infoHash } = useParams<{ infoHash: string }>()
  const navigate = useNavigate()

  const torrent = useTorrentStore((s) => (infoHash ? s.streams.get(infoHash) || s.downloads.get(infoHash) : undefined))
  const prog = useTorrentStore((s) => (infoHash ? s.progress.get(infoHash) : undefined))

  const [streamURL, setStreamURL] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null)
  const [showFileSelector, setShowFileSelector] = useState(false)

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

  // Subtitle file extensions
  const subtitleExts = useMemo(() => new Set(['vtt', 'srt', 'ass', 'ssa', 'sub']), [])

  const subtitleTracks = useMemo(() => {
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
        src: `${streamBase}/${f.index}`
      }))
  }, [torrent?.files, torrent?.infoHash, torrent?.streamURL, subtitleExts])

  // Fetch stream URL — retry if the torrent isn't ready yet
  useEffect(() => {
    if (!infoHash) return
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout>

    const fetchURL = async () => {
      try {
        // Wait until the torrent is actually ready in the store
        // (metadata resolved, file selected, stream server can serve it)
        const allTorrents = await window.torrentAPI.getTorrents()
        const found = allTorrents.find((t) => t.infoHash === infoHash)

        if (!found || !found.ready) {
          console.log('[Player] Torrent not ready yet, retrying in 1.5s...')
          if (!cancelled) {
            retryTimer = setTimeout(fetchURL, 1500)
          }
          return
        }

        console.log('[Player] Torrent ready, fetching stream URL for', infoHash)
        const url = await window.torrentAPI.getStreamURL(infoHash)
        console.log('[Player] Got stream URL:', url)
        if (!cancelled && url) {
          setStreamURL(url)
          setLoading(false)
          setError(null)
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
    }
  }, [infoHash])

  // Cleanup stream data when TRULY leaving the player page.
  // We use a deferred approach to survive React StrictMode's
  // mount→unmount→remount cycle in development.
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const torrentModeRef = useRef<string | undefined>(undefined)

  // Keep the mode ref up-to-date
  useEffect(() => {
    torrentModeRef.current = torrent?.mode
  }, [torrent?.mode])

  useEffect(() => {
    // On mount: cancel any pending cleanup (StrictMode remount case)
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current)
      cleanupTimerRef.current = null
    }

    return () => {
      // On unmount: schedule cleanup after a short delay.
      // If the component remounts (StrictMode), the cleanup is cancelled above.
      // If it's a real navigation away, the timer fires and cleans up.
      const hash = infoHash
      const mode = torrentModeRef.current
      if (hash && mode === 'stream') {
        cleanupTimerRef.current = setTimeout(() => {
          console.log('[Player] Left player — cleaning up stream:', hash)
          useTorrentStore.getState().cleanupStream(hash)
        }, 500)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoHash])

  // File selection handler
  const handleFileSelect = useCallback(
    async (fileIndex: number) => {
      if (!infoHash) return
      setLoading(true)
      setShowFileSelector(false)
      try {
        const url = await window.torrentAPI.selectFile(infoHash, fileIndex)
        setSelectedFileIndex(fileIndex)
        setStreamURL(url)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to select file')
      } finally {
        setLoading(false)
      }
    },
    [infoHash]
  )

  // Seeking handler — convert currentTime (seconds) to a percentage (0-1)
  // because TorrentManager.notifySeek expects a position percent
  const handleSeeking = useCallback(
    (currentTime: number) => {
      if (!infoHash || !torrent) return
      // We need the total file size or duration to compute percentage
      // Use the video duration from the player if available, otherwise estimate
      const videoEl = document.querySelector('video')
      const duration = videoEl?.duration
      if (duration && duration > 0 && isFinite(duration)) {
        const positionPercent = currentTime / duration
        console.log(`[Player] Seek to ${Math.round(positionPercent * 100)}%`)
        window.torrentAPI.notifySeek(infoHash, positionPercent)
      }
    },
    [infoHash, torrent]
  )

  // ── History tracking ──────────────────────────────────
  const addToHistory = useUserDataStore((s) => s.addToHistory)
  const lastHistoryUpdate = useRef(0)

  // Add to history when stream starts
  useEffect(() => {
    if (!torrent || !streamURL) return
    addToHistory({
      movieId: torrent.infoHash,
      slug: torrent.infoHash,
      title: torrent.name || 'Unknown',
      poster: '',
      progress: 0,
      magnetURI: ''
    })
  }, [torrent?.infoHash, streamURL, addToHistory])

  // Update progress in history (throttled to every 10s)
  const handleTimeUpdate = useCallback(
    (currentTime: number, duration: number) => {
      if (!torrent || !duration || !isFinite(duration)) return
      const now = Date.now()
      if (now - lastHistoryUpdate.current < 10000) return
      lastHistoryUpdate.current = now
      addToHistory({
        movieId: torrent.infoHash,
        slug: torrent.infoHash,
        title: torrent.name || 'Unknown',
        poster: '',
        progress: currentTime / duration,
        magnetURI: ''
      })
    },
    [torrent, addToHistory]
  )

  // Loading state — show while waiting for torrent metadata + stream URL
  if (loading && !streamURL) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 animate-[fade-in_0.3s_ease-out]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-bg-tertiary)] border-t-[var(--color-accent)]" />
        <p className="text-sm text-[var(--color-text-secondary)]">
          {torrent ? 'Preparing stream…' : 'Connecting to peers…'}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {prog ? `${prog.numPeers} peers · ${Math.round(prog.progress * 100)}%` : 'Resolving metadata…'}
        </p>
      </div>
    )
  }

  // Error state
  if (error && !streamURL) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 animate-[fade-in_0.3s_ease-out]">
        <p className="text-sm text-[var(--color-danger)]">{error}</p>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-bg-tertiary)] px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-card-hover)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto animate-[fade-in_0.3s_ease-out]">
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
            {torrent?.name || 'Loading…'}
          </h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            {torrent ? formatBytes(torrent.totalSize) : '—'}
            {torrent?.files && torrent.files.length > 1
              ? ` · ${torrent.files.length} files`
              : ''}
          </p>
        </div>

        {/* File Selector */}
        {videoFiles.length > 1 && (
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
      <div className="px-4">
        {streamURL && (
          <VideoPlayer
            src={streamURL}
            onSeeking={handleSeeking}
            onTimeUpdate={handleTimeUpdate}
            onError={(err) => console.error('[Player] Video error:', err)}
            subtitleTracks={subtitleTracks}
          />
        )}
      </div>

      {/* Torrent Info Overlay */}
      <div className="space-y-3 px-4 py-4">
        {/* Health Bar */}
        <TorrentHealth
          numPeers={prog?.numPeers ?? 0}
          downloadSpeed={prog?.downloadSpeed ?? 0}
          uploadSpeed={prog?.uploadSpeed ?? 0}
          progress={prog?.progress ?? 0}
          ratio={prog?.ratio ?? 0}
        />

        {/* Buffer Indicator */}
        <div className="glass rounded-xl p-4">
          <BufferIndicator
            progress={prog?.progress ?? 0}
            bufferProgress={prog?.bufferProgress ?? 0}
            downloadSpeed={prog?.downloadSpeed ?? 0}
            uploadSpeed={prog?.uploadSpeed ?? 0}
            peers={prog?.numPeers ?? 0}
          />
        </div>
      </div>
    </div>
  )
}
