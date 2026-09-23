import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Command, Keyboard, Play, Sparkles, Tv, Volume2, X } from 'lucide-react'

interface ShortcutItem {
  keys: string[]
  description: string
}

interface ShortcutCategory {
  title: string
  icon: React.ReactNode
  shortcuts: ShortcutItem[]
}

const CATEGORIES: ShortcutCategory[] = [
  {
    title: 'General & Navigation',
    icon: <Command className="h-4 w-4 text-teal-300" />,
    shortcuts: [
      { keys: ['Ctrl', 'K'], description: 'Open Command Palette & Global Search' },
      { keys: ['?'], description: 'Toggle Keyboard Shortcuts Reference' },
      { keys: ['Esc'], description: 'Close active modal, drawer, or search' }
    ]
  },
  {
    title: 'Playback Controls',
    icon: <Play className="h-4 w-4 text-emerald-300" />,
    shortcuts: [
      { keys: ['Space'], description: 'Play / Pause' },
      { keys: ['K'], description: 'Play / Pause (YouTube style)' },
      { keys: ['F'], description: 'Toggle Fullscreen' },
      { keys: ['←', '→'], description: 'Seek backward / forward 10 seconds' },
      { keys: ['J', 'L'], description: 'Seek backward / forward 10 seconds' },
      { keys: ['0', '—', '9'], description: 'Seek directly to 0% — 90% of duration' }
    ]
  },
  {
    title: 'Audio & Subtitles',
    icon: <Volume2 className="h-4 w-4 text-cyan-300" />,
    shortcuts: [
      { keys: ['↑', '↓'], description: 'Increase / Decrease volume by 5%' },
      { keys: ['M'], description: 'Toggle Mute / Unmute' },
      { keys: ['C'], description: 'Toggle Subtitles on / off' }
    ]
  },
  {
    title: 'Series & Episodes',
    icon: <Tv className="h-4 w-4 text-sky-300" />,
    shortcuts: [
      { keys: ['N'], description: 'Play Next Episode' },
      { keys: ['[', ']'], description: 'Decrease / Increase playback speed (0.25x)' }
    ]
  }
]

export default function ShortcutsOverlay() {
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()
  // The VideoPlayer already handles '?' in-player — don't double-register
  const isPlayer = location.pathname.startsWith('/player')

  // Listen for '?' key and custom event
  useEffect(() => {
    // In the player, VideoPlayer already owns '?' — don't register a competing listener
    if (isPlayer) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      const target = e.target as HTMLElement | null
      const isInput = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )

      if (e.key === '?' && !isInput && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    const handleCustomOpen = () => setIsOpen(true)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('open-shortcuts', handleCustomOpen)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('open-shortcuts', handleCustomOpen)
    }
  }, [isOpen, isPlayer])

  if (!isOpen || isPlayer) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-[fade-in_0.15s_ease-out]"
      onClick={() => setIsOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div
        className="relative max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.09] bg-[#121417] shadow-2xl shadow-black/80"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-400/10 text-teal-300">
              <Keyboard className="h-4 w-4" />
            </div>
            <div>
              <h2 id="shortcuts-title" className="text-sm font-semibold text-white/90">
                Keyboard Shortcuts
              </h2>
              <p className="text-[10px] text-white/40">
                Quick commands and playback controls across StreamForge
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close shortcuts overlay"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="scrollbar-none max-h-[calc(85vh-130px)] overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {CATEGORIES.map((category) => (
              <div
                key={category.title}
                className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4"
              >
                <div className="mb-3 flex items-center gap-2 text-xs font-medium text-white/70">
                  {category.icon}
                  <span>{category.title}</span>
                </div>

                <div className="space-y-2.5">
                  {category.shortcuts.map((shortcut, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 text-[11px]"
                    >
                      <span className="text-white/55 leading-tight">{shortcut.description}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        {shortcut.keys.map((k, kIdx) => (
                          <kbd
                            key={kIdx}
                            className="min-w-[20px] rounded-md border border-white/[0.12] bg-[#1a1d21] px-1.5 py-0.5 text-center font-mono text-[10px] font-medium text-white/80 shadow-inner"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.06] bg-[#0e1012] px-6 py-3 text-[10px] text-white/40">
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-teal-300/60" />
            Press <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.2 font-mono text-[9px]">?</kbd> anywhere to toggle
          </span>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-md bg-white/[0.06] px-2.5 py-1 font-medium text-white/70 hover:bg-white/[0.1] hover:text-white"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
