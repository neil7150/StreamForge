import { useEffect, useState, useCallback } from 'react'
import {
  HardDrive,
  Trash2,
  MonitorPlay,
  Palette,
  Info,
  Loader2,
  CheckCircle2,
  ExternalLink
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { formatBytes } from '../lib/utils'

export default function Settings() {
  const cacheSize = useAppStore((s) => s.cacheSize)
  const refreshCacheSize = useAppStore((s) => s.refreshCacheSize)

  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [defaultQuality, setDefaultQuality] = useState('auto')

  useEffect(() => {
    refreshCacheSize()
  }, [refreshCacheSize])

  const handleClearCache = useCallback(async () => {
    setClearing(true)
    setCleared(false)
    try {
      await window.torrentAPI.clearCache()
      await refreshCacheSize()
      setCleared(true)
      setTimeout(() => setCleared(false), 2000)
    } catch {
      // Silently fail
    } finally {
      setClearing(false)
    }
  }, [refreshCacheSize])

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6 animate-[fade-in_0.3s_ease-out]">
      <h1 className="mb-6 text-xl font-bold text-[var(--color-text-primary)]">Settings</h1>

      <div className="mx-auto w-full max-w-2xl space-y-4">
        {/* ===== CACHE ===== */}
        <div className="glass rounded-xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-[var(--color-accent)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Cache</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--color-text-secondary)]">Current cache size</p>
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                {formatBytes(cacheSize)}
              </p>
            </div>

            <button
              onClick={handleClearCache}
              disabled={clearing || cacheSize === 0}
              className="flex items-center gap-2 rounded-lg bg-[var(--color-danger)]/10 px-4 py-2.5 text-sm font-medium text-[var(--color-danger)] transition-all duration-200 hover:bg-[var(--color-danger)]/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {clearing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : cleared ? (
                <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {cleared ? 'Cleared!' : 'Clear Cache'}
            </button>
          </div>
        </div>

        {/* ===== PLAYBACK ===== */}
        <div className="glass rounded-xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <MonitorPlay className="h-4 w-4 text-[var(--color-accent)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Playback</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--color-text-secondary)]">Default quality</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Applied when multiple quality options are available
              </p>
            </div>

            <select
              value={defaultQuality}
              onChange={(e) => setDefaultQuality(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition-colors hover:border-[var(--color-border-hover)] focus:border-[var(--color-accent)]"
            >
              <option value="auto">Auto</option>
              <option value="1080p">1080p</option>
              <option value="720p">720p</option>
              <option value="480p">480p</option>
            </select>
          </div>
        </div>

        {/* ===== APPEARANCE ===== */}
        <div className="glass rounded-xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <Palette className="h-4 w-4 text-[var(--color-accent)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Appearance</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--color-text-secondary)]">Theme</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                More themes coming soon
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
              <span className="h-3 w-3 rounded-full bg-[var(--color-bg-primary)] ring-1 ring-[var(--color-border)]" />
              Dark
            </div>
          </div>
        </div>

        {/* ===== ABOUT ===== */}
        <div className="glass rounded-xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <Info className="h-4 w-4 text-[var(--color-accent)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">About</h2>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--color-text-secondary)]">Version</p>
              <span className="rounded-md bg-[var(--color-bg-tertiary)] px-2.5 py-1 text-xs font-mono text-[var(--color-text-primary)]">
                1.0.0-beta
              </span>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--color-text-secondary)]">Built with</p>
              <span className="text-xs text-[var(--color-text-muted)]">
                Electron · React · WebTorrent
              </span>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-[var(--color-border)]">
              <a
                href="#"
                className="flex items-center gap-1 text-xs text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-hover)]"
              >
                GitHub <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="#"
                className="flex items-center gap-1 text-xs text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-hover)]"
              >
                License <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="#"
                className="flex items-center gap-1 text-xs text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-hover)]"
              >
                Report Bug <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
