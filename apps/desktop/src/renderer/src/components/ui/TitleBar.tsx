import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import streamForgeLogo from '../../assets/streamforge-logo.png'

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)
  const api = window.torrentAPI

  useEffect(() => {
    if (!api) return
    api.isMaximized().then(setMaximized)
    return api.onWindowMaximized(setMaximized)
  }, [api])

  return (
    <header className="drag-region flex h-10 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#111315]">
      <div className="flex items-center gap-2.5 pl-4">
        <img src={streamForgeLogo} alt="" draggable={false} className="h-7 w-7 select-none object-contain" />
        <span className="select-none text-[12px] font-semibold text-white/80">StreamForge</span>
      </div>
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
        className="no-drag flex h-6 items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] text-white/35 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white/70"
      >
        <span>Search or jump to...</span>
        <kbd className="rounded border border-white/[0.15] bg-white/[0.05] px-1 py-0.2 text-[9px] font-medium text-white/40">
          Ctrl K
        </kbd>
      </button>
      <div className="no-drag flex h-full items-stretch">
        <button onClick={() => api?.minimizeWindow()} className="flex w-11 items-center justify-center hover:bg-white/[0.05]" aria-label="Minimize">
          <Minus className="h-3.5 w-3.5 text-white/35" />
        </button>
        <button onClick={() => api?.maximizeWindow()} className="flex w-11 items-center justify-center hover:bg-white/[0.05]" aria-label={maximized ? 'Restore' : 'Maximize'}>
          {maximized ? <Copy className="h-3 w-3 text-white/35" /> : <Square className="h-3 w-3 text-white/35" />}
        </button>
        <button onClick={() => api?.closeWindow()} className="flex w-11 items-center justify-center hover:bg-red-500/90" aria-label="Close">
          <X className="h-3.5 w-3.5 text-white/35" />
        </button>
      </div>
    </header>
  )
}
