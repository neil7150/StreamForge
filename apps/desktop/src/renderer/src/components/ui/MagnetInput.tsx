import { useState, useCallback } from 'react'
import { Play, Clipboard, Loader2, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import { isValidMagnet } from '../../lib/utils'

interface MagnetInputProps {
  onSubmit: (magnetURI: string) => void
  isLoading: boolean
  error: string | null
}

export default function MagnetInput({ onSubmit, isLoading, error }: MagnetInputProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const displayError = error ?? localError

  const handleSubmit = useCallback(() => {
    setLocalError(null)
    const trimmed = value.trim()
    if (!trimmed) {
      setLocalError('Please enter a magnet link')
      return
    }
    if (!isValidMagnet(trimmed)) {
      setLocalError('Invalid magnet link. Must start with "magnet:?"')
      return
    }
    onSubmit(trimmed)
  }, [value, onSubmit])

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      setValue(text)
      setLocalError(null)
      if (text.trim() && isValidMagnet(text.trim())) {
        onSubmit(text.trim())
      }
    } catch {
      setLocalError('Unable to read clipboard')
    }
  }, [onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading) {
        handleSubmit()
      }
    },
    [handleSubmit, isLoading]
  )

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Input Container */}
      <div
        className={clsx(
          'glass relative flex items-center rounded-2xl transition-all duration-300',
          focused
            ? 'shadow-[0_0_30px_var(--color-accent-glow)] ring-2 ring-[var(--color-accent)]/50'
            : 'shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)]',
          displayError && 'ring-2 ring-[var(--color-danger)]/40'
        )}
      >
        {/* Paste Button */}
        <button
          onClick={handlePaste}
          disabled={isLoading}
          className="group ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-all duration-200 hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)] disabled:opacity-40"
          aria-label="Paste from clipboard"
          title="Paste from clipboard"
        >
          <Clipboard className="h-4 w-4" />
        </button>

        {/* Input */}
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setLocalError(null)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="Paste a magnet link to start streaming..."
          disabled={isLoading}
          className="min-w-0 flex-1 bg-transparent px-3 py-4 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none disabled:opacity-50"
        />

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={isLoading || !value.trim()}
          className={clsx(
            'mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200',
            isLoading
              ? 'bg-[var(--color-accent)]/50 cursor-wait'
              : value.trim()
                ? 'bg-[var(--color-accent)] text-white shadow-[var(--shadow-glow)] hover:bg-[var(--color-accent-hover)] hover:scale-105 active:scale-95'
                : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] cursor-not-allowed'
          )}
          aria-label="Start streaming"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4 fill-current" />
          )}
        </button>
      </div>

      {/* Error Message */}
      {displayError && (
        <div className="mt-3 flex items-center gap-2 animate-[fade-in_0.2s_ease-out] px-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[var(--color-danger)]" />
          <p className="text-xs text-[var(--color-danger)]">{displayError}</p>
        </div>
      )}
    </div>
  )
}
