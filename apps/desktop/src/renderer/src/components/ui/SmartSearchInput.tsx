import { useState, useCallback, useRef, useEffect } from 'react'
import { Search, Play, Link2, Clipboard, Loader2, AlertCircle, ArrowRight, X } from 'lucide-react'
import clsx from 'clsx'
import { isValidMagnet } from '../../lib/utils'

interface SmartSearchInputProps {
  onMagnet: (magnetURI: string) => void
  onSearch: (query: string) => void
  onClear?: () => void
  initialValue?: string
  isLoading?: boolean
  error?: string | null
  searchPlaceholder?: string
  autoFocus?: boolean
}

export default function SmartSearchInput({
  onMagnet,
  onSearch,
  onClear,
  initialValue = '',
  isLoading = false,
  error = null,
  searchPlaceholder = 'Search movies, shows, or paste a magnet link',
  autoFocus = false
}: SmartSearchInputProps) {
  const [value, setValue] = useState(initialValue)
  const [focused, setFocused] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isMagnet = isValidMagnet(value.trim())
  const displayError = error ?? localError

  useEffect(() => setValue(initialValue), [initialValue])

  const submit = useCallback(() => {
    setLocalError(null)
    const next = value.trim()
    if (!next) return
    if (isValidMagnet(next)) onMagnet(next)
    else onSearch(next)
  }, [onMagnet, onSearch, value])

  const paste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      setValue(text)
      setLocalError(null)
      if (isValidMagnet(text.trim())) onMagnet(text.trim())
    } catch {
      setLocalError('Unable to read clipboard')
    }
  }, [onMagnet])

  return (
    <div className="w-full">
      <div className={clsx(
        'flex h-12 items-center rounded-xl border bg-[#181a1d] transition-colors',
        focused ? 'border-teal-300/55' : displayError ? 'border-red-400/45' : 'border-white/[0.09] hover:border-white/[0.15]'
      )}>
        <span className="ml-4 text-white/32">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-teal-300" /> : isMagnet ? <Link2 className="h-4 w-4 text-teal-300" /> : <Search className="h-4 w-4" />}
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => { setValue(event.target.value); setLocalError(null) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !isLoading) submit()
            if (event.key === 'Escape') { setValue(''); setLocalError(null); onClear?.(); inputRef.current?.blur() }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={searchPlaceholder}
          autoFocus={autoFocus}
          disabled={isLoading}
          spellCheck={false}
          className={clsx('min-w-0 flex-1 bg-transparent px-3 text-[13px] text-white/85 outline-none placeholder:text-white/27 disabled:opacity-50', isMagnet && 'font-mono text-teal-200')}
        />
        <div className="mr-2 flex shrink-0 items-center gap-1">
          {value ? (
            <button onClick={() => { setValue(''); setLocalError(null); onClear?.(); inputRef.current?.focus() }} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 hover:bg-white/[0.06] hover:text-white/65" title="Clear">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button onClick={() => void paste()} disabled={isLoading} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-medium text-white/35 hover:bg-white/[0.05] hover:text-white/65">
              <Clipboard className="h-3.5 w-3.5" /> Paste
            </button>
          )}
          <button
            onClick={submit}
            disabled={isLoading || !value.trim()}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[10px] font-semibold text-[#17191b] hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/[0.07] disabled:text-white/25"
          >
            {isMagnet ? <><Play className="h-3 w-3 fill-current" /> Stream</> : <>Search <ArrowRight className="h-3 w-3" /></>}
          </button>
        </div>
      </div>
      {(isMagnet || displayError) && (
        <div className="mt-2 flex min-h-4 items-center text-[10px]">
          {isMagnet && <span className="text-teal-300/70">Magnet link detected</span>}
          {displayError && <span className="ml-auto flex items-center gap-1 text-red-300/80"><AlertCircle className="h-3 w-3" />{displayError}</span>}
        </div>
      )}
    </div>
  )
}
