import { useEffect } from 'react'
import { useTorrentStore } from '../stores/torrentStore'

/**
 * Subscribe to torrent IPC events from the preload bridge and
 * pump updates into the Zustand torrent store.
 *
 * Call this hook **once** at the root (App.tsx).
 */
export function useTorrentEvents(): void {
  const updateProgress = useTorrentStore((s) => s.updateProgress)
  const setTorrentReady = useTorrentStore((s) => s.setTorrentReady)
  const setError = useTorrentStore((s) => s.setError)
  const loadStreams = useTorrentStore((s) => s.loadStreams)
  const loadDownloads = useTorrentStore((s) => s.loadDownloads)

  useEffect(() => {
    // Load existing torrents on mount (both modes)
    loadStreams()
    loadDownloads()

    // Subscribe to events
    const cleanupProgress = window.torrentAPI.onTorrentProgress((data) => {
      updateProgress(data)
    })

    const cleanupReady = window.torrentAPI.onTorrentReady((data) => {
      setTorrentReady(data)
    })

    const cleanupError = window.torrentAPI.onTorrentError((data) => {
      setError(`[${data.infoHash.slice(0, 8)}…] ${data.error}`)
    })

    return () => {
      cleanupProgress()
      cleanupReady()
      cleanupError()
    }
  }, [updateProgress, setTorrentReady, setError, loadStreams, loadDownloads])
}
