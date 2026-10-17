import { useEffect, useState } from 'react'
import { Film, Play } from 'lucide-react'
import clsx from 'clsx'

interface StreamArtworkProps {
  title: string
  subtitle?: string
  progress?: number
  className?: string
  showPlay?: boolean
  imageUrl?: string | null
}

const palettes = [
  { background: 'hsl(174 18% 17%)', foreground: 'hsl(172 36% 66%)' },
  { background: 'hsl(207 17% 18%)', foreground: 'hsl(202 32% 68%)' },
  { background: 'hsl(38 16% 18%)', foreground: 'hsl(39 36% 67%)' },
  { background: 'hsl(12 14% 18%)', foreground: 'hsl(13 29% 67%)' },
  { background: 'hsl(220 8% 18%)', foreground: 'hsl(215 13% 67%)' }
]

function paletteFor(title: string) {
  const seed = Array.from(title).reduce((total, character) => total + character.charCodeAt(0), 0)
  return palettes[seed % palettes.length]
}

export default function StreamArtwork({
  title,
  subtitle,
  progress = 0,
  className,
  showPlay = false,
  imageUrl
}: StreamArtworkProps) {
  const initial = title.trim().charAt(0).toUpperCase() || 'S'
  const palette = paletteFor(title)
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(imageUrl) && !imageFailed

  useEffect(() => setImageFailed(false), [imageUrl])

  return (
    <div className={clsx('relative overflow-hidden border border-white/[0.06]', className)} style={{ backgroundColor: palette.background }} aria-label={title}>
      {showImage ? (
        <img src={imageUrl!} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <>
          <Film className="absolute left-4 top-4 h-4 w-4 text-white/22" />
          <span className="absolute bottom-8 left-4 text-4xl font-semibold tracking-[-0.05em]" style={{ color: palette.foreground }}>{initial}</span>
        </>
      )}
      {subtitle && (
        <>
          <span className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/80 to-transparent" />
          <p className="absolute inset-x-4 bottom-3 truncate text-[10px] text-white/70">{subtitle}</p>
        </>
      )}
      {showPlay && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#151719]">
            <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
          </span>
        </span>
      )}
      {progress > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
          <div className="h-full bg-teal-300" style={{ width: Math.min(100, Math.max(2, progress * 100)) + '%' }} />
        </div>
      )}
    </div>
  )
}
