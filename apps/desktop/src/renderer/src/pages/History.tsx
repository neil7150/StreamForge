import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bookmark, Clock3, Library, Play, Search, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import StreamArtwork from '../components/ui/StreamArtwork'
import { useUserDataStore } from '../stores/userDataStore'
import { useTorrentStore, type PlaybackDisplayMetadata } from '../stores/torrentStore'
import { extractInfoHash } from '../lib/utils'

type LibraryTab = 'recent' | 'saved'

function timeAgo(timestamp: number) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes + 'm ago'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + 'h ago'
  const days = Math.floor(hours / 24)
  return days < 30 ? days + 'd ago' : new Date(timestamp).toLocaleDateString()
}

export default function History() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<LibraryTab>('recent')
  const history = useUserDataStore((state) => state.history)
  const watchlist = useUserDataStore((state) => state.watchlist)
  const removeFromHistory = useUserDataStore((state) => state.removeFromHistory)
  const removeFromWatchlist = useUserDataStore((state) => state.removeFromWatchlist)
  const clearHistory = useUserDataStore((state) => state.clearHistory)
  const streams = useTorrentStore((state) => state.streams)
  const addTorrent = useTorrentStore((state) => state.addTorrent)

  const startMagnet = (
    magnetURI: string,
    fallbackHash?: string,
    displayMetadata?: PlaybackDisplayMetadata
  ) => {
    if (fallbackHash && streams.has(fallbackHash)) { navigate('/player/' + fallbackHash); return }
    const hash = extractInfoHash(magnetURI)
    if (!hash) return
    void addTorrent(magnetURI, undefined, displayMetadata).catch(() => {})
    navigate('/player/' + hash)
  }

  const isEmpty = tab === 'recent' ? history.length === 0 : watchlist.length === 0

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto w-full max-w-[1160px] px-10 pb-14 pt-9">
        <header className="flex items-end justify-between">
          <div><h1 className="text-[22px] font-semibold tracking-[-0.025em] text-white/90">Library</h1><p className="mt-1.5 text-[11px] text-white/32">Recent playback and saved titles.</p></div>
          {tab === 'recent' && history.length > 0 && <button onClick={clearHistory} className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-red-300/75"><Trash2 className="h-3.5 w-3.5" /> Clear history</button>}
        </header>

        <div className="mt-7 flex gap-6 border-b border-white/[0.06]">
          <button onClick={() => setTab('recent')} className={clsx('flex items-center gap-2 border-b-2 pb-3 text-[11px] font-medium', tab === 'recent' ? 'border-teal-300 text-white/80' : 'border-transparent text-white/30 hover:text-white/60')}><Clock3 className="h-3.5 w-3.5" /> Recent <span className="text-white/25">{history.length}</span></button>
          <button onClick={() => setTab('saved')} className={clsx('flex items-center gap-2 border-b-2 pb-3 text-[11px] font-medium', tab === 'saved' ? 'border-teal-300 text-white/80' : 'border-transparent text-white/30 hover:text-white/60')}><Bookmark className="h-3.5 w-3.5" /> Saved <span className="text-white/25">{watchlist.length}</span></button>
        </div>

        {isEmpty ? (
          <section className="flex min-h-[390px] flex-col items-center justify-center text-center">
            {tab === 'recent' ? <Library className="h-6 w-6 text-white/14" /> : <Bookmark className="h-6 w-6 text-white/14" />}
            <h2 className="mt-4 text-[13px] font-medium text-white/55">{tab === 'recent' ? 'Nothing watched yet' : 'No saved titles'}</h2>
            <p className="mt-1.5 text-[10px] text-white/25">{tab === 'recent' ? 'Playback history will appear here.' : 'Titles you save will appear here.'}</p>
            <button onClick={() => navigate('/search')} className="mt-5 flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[10px] text-white/55 hover:bg-white/[0.05]"><Search className="h-3 w-3" /> Discover</button>
          </section>
        ) : (
          <section className="mt-7 grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3 xl:grid-cols-5">
            {(tab === 'recent' ? history : watchlist).map((entry) => {
              const recent = tab === 'recent'
              const magnet = entry.magnetURI
              const displayMetadata = { title: entry.title, posterUrl: entry.poster || null }
              return (
                <article key={entry.movieId} className="group min-w-0">
                  <button onClick={() => recent ? startMagnet(magnet, entry.movieId, displayMetadata) : magnet && startMagnet(magnet, undefined, displayMetadata)} disabled={!magnet && (!recent || !streams.has(entry.movieId))} className="block w-full text-left disabled:cursor-default">
                    <StreamArtwork title={entry.title} imageUrl={entry.poster} subtitle={recent ? timeAgo((entry as typeof history[number]).watchedAt) : ('year' in entry && entry.year ? String(entry.year) : 'Saved')} progress={recent ? (entry as typeof history[number]).progress : 0} showPlay={Boolean(magnet) || (recent && streams.has(entry.movieId))} className="aspect-[1.5/1] w-full rounded-lg transition-colors group-hover:border-white/15" />
                  </button>
                  <div className="mt-2 flex items-start gap-2"><div className="min-w-0 flex-1"><h2 className="truncate text-[11px] font-medium text-white/60 group-hover:text-white/80">{entry.title}</h2><p className="mt-1 text-[9px] text-white/24">{recent ? Math.round((entry as typeof history[number]).progress * 100) + '% watched' : ('year' in entry && entry.year ? entry.year : 'Saved')}</p></div>
                    {recent ? <button onClick={() => removeFromHistory(entry.movieId)} className="opacity-0 text-white/18 hover:text-red-300 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button> : <div className="flex gap-2 opacity-0 group-hover:opacity-100">{magnet && <button onClick={() => startMagnet(magnet, undefined, displayMetadata)} className="text-teal-300/70"><Play className="h-3 w-3 fill-current" /></button>}<button onClick={() => removeFromWatchlist(entry.movieId)} className="text-white/18 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button></div>}
                  </div>
                </article>
              )
            })}
          </section>
        )}
      </main>
    </div>
  )
}
