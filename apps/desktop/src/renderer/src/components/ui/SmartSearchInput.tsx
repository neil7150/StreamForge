import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Search,
  Play,
  Link2,
  Clipboard,
  Loader2,
  AlertCircle,
  ArrowRight,
  X
} from 'lucide-react'
import clsx from 'clsx'
import { isValidMagnet } from '../../lib/utils'

type InputMode = 'search' | 'magnet'

interface SmartSearchInputProps {
  /** Called when the user wants to stream a magnet link */
  onMagnet: (magnetURI: string) => void
  /** Called when the user wants to search with text */
  onSearch: (query: string) => void
  /** Optional initial value (e.g. when re-opening search page) */
  initialValue?: string
  /** Loading state from the parent */
  isLoading?: boolean
  /** External error (e.g. from torrent add failure) */
  error?: string | null
  /** Placeholder shown in search mode */
  searchPlaceholder?: string
  /** Auto-focus on mount */
  autoFocus?: boolean
}

export default function SmartSearchInput({
  onMagnet,
  onSearch,
  initialValue = '',
  isLoading = false,
  error = null,
  searchPlaceholder = 'Search movies, shows, or paste a magnet link...',
  autoFocus = false
}: SmartSearchInputProps) {
  const [value, setValue] = useState(initialValue)
  const [focused, setFocused] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Detect mode based on current input value
  const mode: InputMode = isValidMagnet(value.trim()) ? 'magnet' : 'search'

  const displayError = error ?? localError

  // Update when initialValue changes from parent
  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  const handleSubmit = useCallback(() => {
    setLocalError(null)
    const trimmed = value.trim()
    if (!trimmed) return

    if (isValidMagnet(trimmed)) {
      onMagnet(trimmed)
    } else {
      onSearch(trimmed)
    }
  }, [value, onMagnet, onSearch])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading) {
        handleSubmit()
      }
      if (e.key === 'Escape') {
        setValue('')
        setLocalError(null)
        inputRef.current?.blur()
      }
    },
    [handleSubmit, isLoading]
  )

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)
    setLocalError(null)
  }, [])

  const handleClear = useCallback(() => {
    setValue('')
    setLocalError(null)
    inputRef.current?.focus()
  }, [])

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      setValue(text)
      setLocalError(null)
      // Auto-submit if it's a magnet link
      if (text.trim() && isValidMagnet(text.trim())) {
        onMagnet(text.trim())
      }
    } catch {
      setLocalError('Unable to read clipboard')
    }
  }, [onMagnet])

  const isMagnet = mode === 'magnet'

  return (
    <div className="w-full">
      {/* Main input container */}
      <div
        className={clsx(
          'relative flex items-center rounded-2xl transition-all duration-300',
          // Background & border
          'bg-white/[0.04] border',
          focused
            ? isMagnet
              ? 'border-violet-500/60 shadow-[0_0_0_3px_rgba(139,92,246,0.12),0_8px_32px_rgba(0,0,0,0.4)]'
              : 'border-[var(--color-accent)]/50 shadow-[0_0_0_3px_var(--color-accent-glow),0_8px_32px_rgba(0,0,0,0.4)]'
            : displayError
              ? 'border-red-500/40 shadow-[0_0_0_2px_rgba(239,68,68,0.08)]'
              : 'border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.35)] hover:border-white/20 hover:shadow-[0_8px_32px_rgba(0,0,0,0.45)]'
        )}
      >
        {/* Left icon — morphs based on mode */}
        <div
          className={clsx(
            'ml-4 mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300',
            isMagnet
              ? 'bg-violet-500/15 text-violet-400'
              : 'text-[var(--color-text-muted)]'
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-accent)]" />
          ) : isMagnet ? (
            <Link2 className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={searchPlaceholder}
          autoFocus={autoFocus}
          disabled={isLoading}
          spellCheck={false}
          className={clsx(
            'min-w-0 flex-1 bg-transparent px-3 py-4 text-sm outline-none transition-colors disabled:opacity-50',
            isMagnet
              ? 'font-mono text-violet-300 placeholder-violet-400/40'
              : 'text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)]'
          )}
        />

        {/* Right actions */}
        <div className="mr-3 flex items-center gap-1.5 shrink-0">
          {/* Clear button */}
          {value && !isLoading && (
            <button
              onClick={handleClear}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-all hover:bg-white/10 hover:text-[var(--color-text-secondary)]"
              title="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Paste button — always visible */}
          {!value && (
            <button
              onClick={handlePaste}
              disabled={isLoading}
              className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-[var(--color-text-muted)] transition-all hover:bg-white/10 hover:text-[var(--color-text-secondary)] disabled:opacity-40"
              title="Paste from clipboard"
            >
              <Clipboard className="h-3.5 w-3.5" />
              <span>Paste</span>
            </button>
          )}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={isLoading || !value.trim()}
            className={clsx(
              'flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-semibold transition-all duration-200',
              'disabled:opacity-30 disabled:cursor-not-allowed',
              value.trim() && !isLoading
                ? isMagnet
                  ? 'bg-violet-500 text-white shadow-[0_0_16px_rgba(139,92,246,0.35)] hover:bg-violet-400 hover:shadow-[0_0_20px_rgba(139,92,246,0.5)] active:scale-95'
                  : 'bg-[var(--color-accent)] text-white shadow-[var(--shadow-glow)] hover:bg-[var(--color-accent-hover)] active:scale-95'
                : 'bg-white/8 text-[var(--color-text-muted)]'
            )}
          >
            {isMagnet ? (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Stream</span>
              </>
            ) : (
              <>
                <span>Search</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mode indicator pill */}
      <div className="mt-2 flex items-center gap-2 px-1">
        {isMagnet ? (
          <span className="flex items-center gap-1.5 rounded-full bg-violet-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-400">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
            Magnet link detected — press Enter to stream
          </span>
        ) : value.trim() ? (
          <span className="text-[10px] text-[var(--color-text-muted)]/70">
            Press <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[10px]">Enter</kbd> to search · or paste a magnet link to stream instantly
          </span>
        ) : (
          <span className="text-[10px] text-[var(--color-text-muted)]/50">
            Search worldwide torrents · or paste a magnet link to stream instantly
          </span>
        )}

        {/* Error */}
        {displayError && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-red-400">
            <AlertCircle className="h-3 w-3" />
            {displayError}
          </span>
        )}
      </div>
    </div>
  )
}
