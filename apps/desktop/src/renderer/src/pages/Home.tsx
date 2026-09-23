import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Circle, X } from 'lucide-react'
import clsx from 'clsx'
import SmartSearchInput from '../components/ui/SmartSearchInput'
import StreamArtwork from '../components/ui/StreamArtwork'
import { useTorrentStore, type PlaybackDisplayMetadata } from '../stores/torrentStore'
import { useUserDataStore } from '../stores/userDataStore'
import { extractInfoHash, formatBytes, formatSpeed } from '../lib/utils'

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const addTorrent = useTorrentStore((state) => state.addTorrent)
  const removeTorrent = useTorrentStore((state) => state.removeTorrent)
  const streams = useTorrentStore((state) => state.streams)
  const progress = useTorrentStore((state) => state.progress)
  const streamDisplayMetadata = useTorrentStore((state) => state.streamDisplayMetadata)
  const isLoading = useTorrentStore((state) => state.isLoading)
  const error = useTorrentStore((state) => state.error)
  const clearError = useTorrentStore((state) => state.clearError)
  const history = useUserDataStore((state) => state.history)
  const removeFromHistory = useUserDataStore((state) => state.removeFromHistory)

  const handleMagnet = useCallback((magnetURI: string, displayMetadata?: PlaybackDisplayMetadata) => {
    clearError()
    const hash = extractInfoHash(magnetURI)
    if (!hash) return
    void addTorrent(magnetURI, undefined, displayMetadata).catch(() => {})
    navigate('/player/' + hash)
  }, [addTorrent, clearError, navigate])

  const handleSearch = useCallback((query: string) => {
    navigate('/search', { state: { query } })
  }, [navigate])

  useEffect(() => {
    const state = location.state as { magnetURI?: string } | null
    if (!state?.magnetURI) return
    handleMagnet(state.magnetURI)
    window.history.replaceState({}, '')
  }, [handleMagnet, location.state])

  const activeStreams = Array.from(streams.values())
  const recentHistory = history.slice(0, 6)
  const continueWatchingItem = history.find(
    (entry) => entry.progress > 0.02 && entry.progress < 0.95 && (Boolean(entry.magnetURI) || streams.has(entry.movieId))
  )

  const resume = (movieId: string, magnetURI: string, displayMetadata: PlaybackDisplayMetadata) => {
    if (streams.has(movieId)) navigate('/player/' + movieId)
    else if (magnetURI) handleMagnet(magnetURI, displayMetadata)
  }

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto w-full max-w-[1280px] px-10 pb-14 pt-9">
        <header className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold tracking-[-0.025em] text-white/90">Home</h1>
          <span className="flex items-center gap-2 text-[10px] text-white/32">
            <Circle className="h-2 w-2 fill-teal-300 text-teal-300" /> Ready
          </span>
        </header>

        {continueWatchingItem && (
          <section className="relative mt-6 overflow-hidden rounded-2xl border border-white/[0.1] bg-[#141619] shadow-xl">
            {continueWatchingItem.poster && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <img
                  src={continueWatchingItem.poster}
                  alt=""
                  className="absolute -top-10 -right-10 h-full w-[60%] object-cover opacity-20 blur-2xl"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#141619] via-[#141619]/90 to-transparent" />
              </div>
            )}
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 p-6">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-black/40">
                  <StreamArtwork
                    title={continueWatchingItem.title}
                    imageUrl={continueWatchingItem.poster}
                    className="h-full w-full object-cover"
                    showPlay
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 rounded bg-teal-400/10 px-2 py-0.5 text-[9px] font-semibold text-teal-300">
                      <Circle className="h-1.5 w-1.5 fill-teal-300" /> Jump Back In
                    </span>
                    {continueWatchingItem.seriesTitle && (
                      <span className="text-[10px] text-white/40">
                        {continueWatchingItem.seriesTitle}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1.5 truncate text-[16px] font-semibold text-white/95">
                    {continueWatchingItem.title}
                  </h2>
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="h-1.5 w-36 overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className="h-full bg-teal-300 transition-all duration-300"
                        style={{ width: `${Math.round(continueWatchingItem.progress * 100)}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-white/40 font-medium">
                      {Math.round(continueWatchingItem.progress * 100)}% watched
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() =>
                    resume(continueWatchingItem.movieId, continueWatchingItem.magnetURI, {
                      title: continueWatchingItem.title,
                      posterUrl: continueWatchingItem.poster || null,
                      contentKey: continueWatchingItem.contentKey,
                      contentType: continueWatchingItem.contentType,
                      catalogId: continueWatchingItem.catalogId,
                      seriesId: continueWatchingItem.seriesId,
                      seriesTitle: continueWatchingItem.seriesTitle,
                      episodeId: continueWatchingItem.episodeId,
                      seasonNumber: continueWatchingItem.seasonNumber,
                      episodeNumber: continueWatchingItem.episodeNumber,
                      episodeTitle: continueWatchingItem.episodeTitle
                    })
                  }
                  className="flex h-10 items-center gap-2 rounded-xl bg-white px-5 text-[12px] font-semibold text-[#141619] shadow-lg transition-transform hover:scale-[1.02] hover:bg-white/90 active:scale-[0.98]"
                >
                  <ArrowRight className="h-4 w-4" /> Resume Playback
                </button>
              </div>
            </div>
          </section>
        )}

        <section className={clsx('mx-auto max-w-[760px] text-center', continueWatchingItem ? 'py-10' : 'py-16')}>
          <h2 className="text-[36px] font-semibold tracking-[-0.045em] text-white">What do you want to watch?</h2>
          <p className="mt-3 max-w-xl text-[12px] leading-5 text-white/38 mx-auto">Search available video sources or paste a magnet link.</p>
          <div className="mt-7 text-left">
            <SmartSearchInput onMagnet={handleMagnet} onSearch={handleSearch} isLoading={isLoading} error={error} autoFocus searchPlaceholder="Search movies and shows" />
          </div>
        </section>

        {activeStreams.length > 0 && (
          <section className="border-t border-white/[0.06] pt-7">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-white/75">Active streams</h2>
              <span className="text-[10px] text-white/28">{activeStreams.length}</span>
            </div>
            <div className="divide-y divide-white/[0.055] rounded-xl border border-white/[0.06] bg-[#141619]">
              {activeStreams.map((stream) => {
                const stats = progress.get(stream.infoHash)
                const display = streamDisplayMetadata.get(stream.infoHash.toLowerCase())
                return (
                  <article key={stream.infoHash} className="flex min-w-0 items-center gap-4 px-4 py-3">
                    <button onClick={() => navigate('/player/' + stream.infoHash)} className="h-12 w-20 shrink-0 overflow-hidden rounded-md">
                      <StreamArtwork title={display?.title || stream.name || 'Stream'} imageUrl={display?.posterUrl} className="h-full w-full" showPlay />
                    </button>
                    <button onClick={() => navigate('/player/' + stream.infoHash)} className="min-w-0 flex-1 text-left">
                      <h3 className="truncate text-[12px] font-medium text-white/78">{display?.title || stream.name || 'Resolving stream…'}</h3>
                      <p className="mt-1 text-[10px] text-white/30">{formatBytes(stream.totalSize)}{stats ? ' · ' + stats.numPeers + ' peers · ' + formatSpeed(stats.downloadSpeed) : ''}</p>
                    </button>
                    <button onClick={() => void removeTorrent(stream.infoHash)} className="flex h-8 w-8 items-center justify-center rounded-md text-white/22 hover:bg-white/[0.05] hover:text-white/60" title="Remove stream"><X className="h-3.5 w-3.5" /></button>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        <section className={activeStreams.length ? 'mt-10' : 'border-t border-white/[0.06] pt-7'}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-white/75">Recently watched</h2>
            {recentHistory.length > 0 && <button onClick={() => navigate('/history')} className="flex items-center gap-1.5 text-[10px] text-white/32 hover:text-white/65">View library <ArrowRight className="h-3 w-3" /></button>}
          </div>
          {recentHistory.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {recentHistory.map((entry) => (
                <article key={entry.contentKey || entry.movieId} className="group relative min-w-0">
                  <button
                    onClick={() => resume(entry.movieId, entry.magnetURI, { title: entry.title, posterUrl: entry.poster || null, contentKey: entry.contentKey, contentType: entry.contentType, catalogId: entry.catalogId, seriesId: entry.seriesId, seriesTitle: entry.seriesTitle, episodeId: entry.episodeId, seasonNumber: entry.seasonNumber, episodeNumber: entry.episodeNumber, episodeTitle: entry.episodeTitle })}
                    disabled={!entry.magnetURI && !streams.has(entry.movieId)}
                    className="w-full min-w-0 text-left disabled:cursor-default"
                  >
                    <StreamArtwork title={entry.title} imageUrl={entry.poster} subtitle={Math.round(entry.progress * 100) + '% watched'} progress={entry.progress} showPlay className="aspect-[1.5/1] w-full rounded-lg transition-colors group-hover:border-white/15" />
                    <h3 className="mt-2 truncate text-[11px] font-medium text-white/58 group-hover:text-white/80">{entry.title}</h3>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFromHistory(entry.contentKey || entry.movieId)}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-black/65 text-white/55 shadow-sm backdrop-blur-sm hover:bg-red-950/90 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                    title={`Remove ${entry.title} from recently watched`}
                    aria-label={`Remove ${entry.title} from recently watched`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-dashed border-white/[0.08] px-5 py-7">
              <div><p className="text-[12px] font-medium text-white/55">No recent activity</p><p className="mt-1 text-[10px] text-white/27">Your playback history will appear here.</p></div>
              <button onClick={() => navigate('/search')} className="rounded-lg border border-white/[0.09] px-3 py-2 text-[10px] font-medium text-white/55 hover:bg-white/[0.05] hover:text-white/80">Browse sources</button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
