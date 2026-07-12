import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X, Zap } from 'lucide-react'

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    // Initial state
    window.torrentAPI.isMaximized().then(setMaximized)
    // Listen for changes
    const cleanup = window.torrentAPI.onWindowMaximized(setMaximized)
    return cleanup
  }, [])

  return (
    <header className="drag-region relative z-50 flex h-9 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/80 backdrop-blur-md">
      {/* App Brand */}
      <div className="no-drag flex items-center gap-2 pl-3">
        <Zap className="h-4 w-4 text-[var(--color-accent)]" />
        <span className="gradient-text text-sm font-bold tracking-wide select-none">
          StreamForge
        </span>
      </div>

      {/* Drag spacer */}
      <div className="flex-1" />

      {/* Window Controls */}
      <div className="no-drag flex h-full items-stretch">
        <button
          onClick={() => window.torrentAPI.minimizeWindow()}
          className="flex w-11 items-center justify-center transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]"
          aria-label="Minimize"
        >
          <Minus className="h-3.5 w-3.5 text-[var(--color-text-secondary)]" />
        </button>

        <button
          onClick={() => window.torrentAPI.maximizeWindow()}
          className="flex w-11 items-center justify-center transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]"
          aria-label={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? (
            <Copy className="h-3 w-3 text-[var(--color-text-secondary)]" />
          ) : (
            <Square className="h-3 w-3 text-[var(--color-text-secondary)]" />
          )}
        </button>

        <button
          onClick={() => window.torrentAPI.closeWindow()}
          className="flex w-11 items-center justify-center transition-colors duration-150 hover:bg-[var(--color-danger)] hover:text-white"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5 text-[var(--color-text-secondary)]" />
        </button>
      </div>
    </header>
  )
}
