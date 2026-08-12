import { useEffect, useState } from 'react'
import { Film, Loader2, RefreshCw, Tv } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { MovieSummary, SeriesSummary } from '../../../preload/index.d'

function CatalogCard({ title, image, subtitle, onClick }: {
  title: string
  image: string | null
  subtitle: string
  onClick: () => void
}) {
  const [failed, setFailed] = useState(false)
  return (
    <button onClick={onClick} className="group min-w-0 text-left">
      <div className="flex aspect-[2/3] items-center justify-center overflow-hidden rounded-xl border border-white/[0.07] bg-[#171a1c] transition group-hover:-translate-y-1 group-hover:border-white/20">
        {image && !failed
          ? <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
          : <Film className="h-7 w-7 text-white/12" />}
      </div>
      <h3 className="mt-2.5 truncate text-[11px] font-medium text-white/65 group-hover:text-white/90">{title}</h3>
      <p className="mt-1 truncate text-[9px] text-white/27">{subtitle}</p>
    </button>
  )
}

export default function Browse() {
  const navigate = useNavigate()
  const [movies, setMovies] = useState<MovieSummary[]>([])
  const [series, setSeries] = useState<SeriesSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [request, setRequest] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.allSettled([window.torrentAPI.getPopularMovies(), window.torrentAPI.getPopularSeries()])
      .then(([movieResult, seriesResult]) => {
        if (cancelled) return
        if (movieResult.status === 'fulfilled') setMovies(movieResult.value)
        if (seriesResult.status === 'fulfilled') setSeries(seriesResult.value)
        if (movieResult.status === 'rejected' && seriesResult.status === 'rejected') {
          setError('The browse catalogs could not be reached. Check your connection and try again.')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [request])

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto max-w-[1240px] px-10 pb-14 pt-9">
        <header className="flex items-end justify-between">
          <div><h1 className="text-[22px] font-semibold text-white/90">Browse</h1><p className="mt-1.5 text-[11px] text-white/32">Popular movies and shows, updated from the catalog.</p></div>
          <button onClick={() => setRequest((value) => value + 1)} className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] text-white/45 hover:bg-white/[0.05]"><RefreshCw className="h-3 w-3" /> Refresh</button>
        </header>
        {loading && <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-teal-300" /></div>}
        {!loading && error && <div className="mt-10 rounded-xl border border-white/[0.07] p-8 text-center text-[11px] text-white/45">{error}</div>}
        {!loading && movies.length > 0 && <section className="mt-9"><h2 className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-white/72"><Film className="h-4 w-4 text-teal-300/65" /> Popular movies</h2><div className="grid grid-cols-3 gap-x-4 gap-y-7 md:grid-cols-5 xl:grid-cols-7">{movies.slice(0, 14).map((movie) => <CatalogCard key={movie.id} title={movie.title} image={movie.posterUrl} subtitle={`${movie.year ?? 'Movie'}${movie.rating !== null ? ` · ★ ${movie.rating.toFixed(1)}` : ''}`} onClick={() => navigate(`/movie/${encodeURIComponent(movie.id)}`, { state: { movie } })} />)}</div></section>}
        {!loading && series.length > 0 && <section className="mt-11"><h2 className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-white/72"><Tv className="h-4 w-4 text-teal-300/65" /> Popular series</h2><div className="grid grid-cols-3 gap-x-4 gap-y-7 md:grid-cols-5 xl:grid-cols-7">{series.slice(0, 14).map((show) => <CatalogCard key={show.id} title={show.title} image={show.posterUrl} subtitle={`${show.year ?? show.status ?? 'Series'}${show.rating !== null ? ` · ★ ${show.rating.toFixed(1)}` : ''}`} onClick={() => navigate(`/series/${show.id}`, { state: { series: show } })} />)}</div></section>}
        {!loading && !error && movies.length === 0 && series.length === 0 && <p className="mt-16 text-center text-[11px] text-white/35">No catalog titles are available right now.</p>}
      </main>
    </div>
  )
}
