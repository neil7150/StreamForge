import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Play, Trash2, ArrowDown, ArrowUp, Users, HardDrive, FolderOpen, CheckCircle2 } from 'lucide-react'
import { useTorrentStore } from '../stores/torrentStore'
import { formatBytes, formatSpeed } from '../lib/utils'

export default function Downloads() {
  const navigate = useNavigate()
  const downloads = useTorrentStore((s) => s.downloads)
  const progress = useTorrentStore((s) => s.progress)
  const removeTorrent = useTorrentStore((s) => s.removeTorrent)
  const loadDownloads = useTorrentStore((s) => s.loadDownloads)

  // Load persistent downloads on mount
  useEffect(() => {
    loadDownloads()
  }, [loadDownloads])

  const activeDownloads = Array.from(downloads.values())

  const handleOpenFolder = async () => {
    try {
      await window.torrentAPI.openDownloadFolder()
    } catch (err) {
      console.error('Failed to open download folder:', err)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <section className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">Downloads</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {activeDownloads.length} download{activeDownloads.length !== 1 ? 's' : ''}
              <span className="text-[var(--color-text-muted)]"> · Files saved permanently to disk</span>
            </p>
          </div>
          {activeDownloads.length > 0 && (
            <button
              onClick={handleOpenFolder}
              className="flex items-center gap-2 rounded-lg bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)]"
            >
              <FolderOpen className="h-3.5 w-3.5" /> Open Folder
            </button>
          )}
        </div>
      </section>

      <section className="flex-1 px-6 pb-8">
        {activeDownloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Download className="h-12 w-12 text-[var(--color-text-muted)]/30 mb-4" />
            <p className="text-sm text-[var(--color-text-muted)]">No downloads yet</p>
            <p className="text-xs text-[var(--color-text-muted)]/60 mt-1">
              Use the ⬇ Download button on search results to save files permanently
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeDownloads.map((torrent) => {
              const prog = progress.get(torrent.infoHash)
              const pct = prog ? prog.progress * 100 : 0
              const isComplete = pct >= 100

              return (
                <div
                  key={torrent.infoHash}
                  className="glass rounded-xl p-4 transition-all duration-200 hover:shadow-[var(--shadow-card-hover)]"
                >
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {isComplete && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-success)]" />
                        )}
                        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                          {torrent.name || 'Resolving...'}
                        </h3>
                      </div>
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                        {formatBytes(torrent.totalSize)} · {torrent.files?.length || 0} file{(torrent.files?.length || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => navigate(`/player/${torrent.infoHash}`)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors"
                        title="Play"
                      >
                        <Play className="h-4 w-4 fill-current" />
                      </button>
                      <button
                        onClick={() => removeTorrent(torrent.infoHash)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                        title="Remove (keeps files)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: isComplete
                          ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                          : 'linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))'
                      }}
                    />
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-4 text-[11px] text-[var(--color-text-muted)]">
                    <span className="font-medium text-[var(--color-text-secondary)]">
                      {isComplete ? '✓ Complete' : `${pct.toFixed(1)}%`}
                    </span>

                    {prog && !isComplete && (
                      <>
                        <span className="flex items-center gap-1">
                          <ArrowDown className="h-3 w-3 text-[var(--color-success)]" />
                          {formatSpeed(prog.downloadSpeed)}
                        </span>
                        <span className="flex items-center gap-1">
                          <ArrowUp className="h-3 w-3 text-blue-400" />
                          {formatSpeed(prog.uploadSpeed)}
                        </span>
                      </>
                    )}

                    {prog && (
                      <>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {prog.numPeers} peer{prog.numPeers !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1 ml-auto">
                          <HardDrive className="h-3 w-3" />
                          {formatBytes(prog.downloaded)} / {formatBytes(prog.totalSize)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
