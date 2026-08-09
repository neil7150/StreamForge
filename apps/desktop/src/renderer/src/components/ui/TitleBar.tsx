import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X, Play } from 'lucide-react'

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
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-300 text-[#10201f]">
          <Play className="ml-px h-2.5 w-2.5 fill-current" />
        </span>
        <span className="select-none text-[12px] font-semibold text-white/80">StreamForge</span>
      </div>
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