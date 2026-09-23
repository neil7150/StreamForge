import { useEffect, useRef, useState } from 'react'
import { Check, Copy, TriangleAlert } from 'lucide-react'

interface CopyMagnetButtonProps {
  magnetURI: string
}

export default function CopyMagnetButton({ magnetURI }: CopyMagnetButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const resetTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
  }, [])

  const copyMagnet = async () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
    try {
      await navigator.clipboard.writeText(magnetURI)
      setState('copied')
    } catch {
      setState('failed')
    }
    resetTimerRef.current = window.setTimeout(() => setState('idle'), 1800)
  }

  const label = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy magnet'
  const Icon = state === 'copied' ? Check : state === 'failed' ? TriangleAlert : Copy

  return (
    <button
      type="button"
      onClick={() => void copyMagnet()}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.09] px-2.5 text-[9px] text-white/48 transition-colors hover:bg-white/[0.06] hover:text-white/78"
      title="Copy magnet link"
      aria-label="Copy magnet link"
    >
      <Icon className={state === 'copied' ? 'h-3 w-3 text-teal-300' : state === 'failed' ? 'h-3 w-3 text-amber-300' : 'h-3 w-3'} />
      {label}
    </button>
  )
}
