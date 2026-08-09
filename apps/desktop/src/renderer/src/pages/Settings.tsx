import { useEffect, useState, useCallback } from 'react'
import { Check, HardDrive, Info, Loader2, Trash2 } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { formatBytes } from '../lib/utils'

export default function Settings() {
  const cacheSize = useAppStore((state) => state.cacheSize)
  const refreshCacheSize = useAppStore((state) => state.refreshCacheSize)
  const [clearing, setClearing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => { void refreshCacheSize() }, [refreshCacheSize])

  const clearCache = useCallback(async () => {
    setClearing(true); setMessage(null)
    try {
      if (!window.torrentAPI) return
      await window.torrentAPI.clearCache()
      await refreshCacheSize()
      setMessage('Temporary cache cleared')
    } catch {
      setMessage('The cache could not be cleared. Close active streams and try again.')
    } finally { setClearing(false) }
  }, [refreshCacheSize])

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto w-full max-w-[860px] px-10 pb-14 pt-9">
        <header><h1 className="text-[22px] font-semibold tracking-[-0.025em] text-white/90">Settings</h1><p className="mt-1.5 text-[11px] text-white/32">Storage and playback information.</p></header>

        <section className="mt-9">
          <h2 className="text-[11px] font-semibold text-white/48">Storage</h2>
          <div className="mt-3 divide-y divide-white/[0.055] border-y border-white/[0.06]">
            <div className="flex items-center gap-4 py-5">
              <HardDrive className="h-4 w-4 text-white/25" />
              <div className="min-w-0 flex-1"><p className="text-[12px] font-medium text-white/67">Temporary streaming cache</p><p className="mt-1 text-[10px] text-white/27">Watched pieces are removed automatically around the playback window.</p></div>
              <span className="text-[12px] font-medium text-white/55">{formatBytes(cacheSize)}</span>
              <button onClick={() => void clearCache()} disabled={clearing || cacheSize === 0} className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 text-[10px] text-white/40 hover:bg-white/[0.05] hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30">{clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Clear</button>
            </div>
          </div>
          {message && <p className="mt-3 text-[10px] text-white/40">{message}</p>}
        </section>

        <section className="mt-9">
          <h2 className="text-[11px] font-semibold text-white/48">Playback</h2>
          <div className="mt-3 divide-y divide-white/[0.055] border-y border-white/[0.06]">
            {[
              ['Direct playback', 'H.264, AAC, WebM'],
              ['Compatibility mode', 'HEVC, AC3, DTS'],
              ['Subtitles', 'Embedded and sidecar tracks'],
              ['Storage policy', 'Temporary and local']
            ].map(([label, value]) => (
              <div key={label} className="flex items-center py-4"><Check className="mr-4 h-3.5 w-3.5 text-teal-300/70" /><span className="flex-1 text-[11px] text-white/58">{label}</span><span className="text-[10px] text-white/28">{value}</span></div>
            ))}
          </div>
        </section>

        <section className="mt-9">
          <h2 className="text-[11px] font-semibold text-white/48">About</h2>
          <div className="mt-3 flex items-center border-y border-white/[0.06] py-4">
            <Info className="mr-4 h-4 w-4 text-white/24" /><div className="flex-1"><p className="text-[11px] text-white/58">StreamForge Desktop</p><p className="mt-1 text-[9px] text-white/24">Electron · React · WebTorrent · FFmpeg</p></div><span className="font-mono text-[9px] text-white/28">0.1.0</span>
          </div>
        </section>
      </main>
    </div>
  )
}