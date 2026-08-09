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
  const setTorrentError = useTorrentStore((s) => s.setTorrentError)
  const loadStreams = useTorrentStore((s) => s.loadStreams)
  const loadDownloads = useTorrentStore((s) => s.loadDownloads)

  useEffect(() => {
    const api = window.torrentAPI
    if (!api) return

    loadStreams()
    loadDownloads()

    const cleanupProgress = api.onTorrentProgress((data) => {
      updateProgress(data)
    })

    const cleanupReady = api.onTorrentReady((data) => {
      setTorrentReady(data)
    })

    const cleanupError = api.onTorrentError((data) => {
      setTorrentError(data.infoHash, data.error)
    })

    return () => {
      cleanupProgress()
      cleanupReady()
      cleanupError()
    }
  }, [updateProgress, setTorrentReady, setTorrentError, loadStreams, loadDownloads])
}
