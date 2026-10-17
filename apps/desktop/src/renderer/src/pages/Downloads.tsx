import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Check, Download, FolderOpen, HardDrive, Play, Trash2, Users } from 'lucide-react'
import { useTorrentStore } from '../stores/torrentStore'
import { formatBytes, formatSpeed } from '../lib/utils'

export default function Downloads() {
  const navigate = useNavigate()
  const downloads = useTorrentStore((state) => state.downloads)
  const loadDownloads = useTorrentStore((state) => state.loadDownloads)

  useEffect(() => { if (window.torrentAPI) void loadDownloads() }, [loadDownloads])
  const items = Array.from(downloads.values())

  const openFolder = async () => {
    try { if (window.torrentAPI) await window.torrentAPI.openDownloadFolder() }
    catch (error) { console.error('[Downloads] Failed to open download folder:', error) }
  }

  return (
    <div className="page-enter h-full overflow-y-auto">
      <main className="mx-auto w-full max-w-[1040px] px-10 pb-14 pt-9">
        <header className="flex items-end justify-between">
          <div><h1 className="text-[22px] font-semibold tracking-[-0.025em] text-white/90">Downloads</h1><p className="mt-1.5 text-[11px] text-white/32">{items.length} saved transfer{items.length === 1 ? '' : 's'}</p></div>
          <button onClick={() => void openFolder()} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[10px] text-white/45 hover:bg-white/[0.05] hover:text-white/70"><FolderOpen className="h-3.5 w-3.5" /> Open folder</button>
        </header>

        {items.length === 0 ? (
          <section className="flex min-h-[430px] flex-col items-center justify-center text-center">
            <Download className="h-6 w-6 text-white/14" /><h2 className="mt-4 text-[13px] font-medium text-white/55">No downloads</h2><p className="mt-1.5 text-[10px] text-white/25">Sources you save will appear here.</p>
            <button onClick={() => navigate('/search')} className="mt-5 rounded-lg border border-white/[0.09] px-3 py-2 text-[10px] text-white/55 hover:bg-white/[0.05]">Discover</button>
          </section>
        ) : (
          <section className="mt-8 divide-y divide-white/[0.055] border-y border-white/[0.06]">
            {items.map((torrent) => <DownloadRow key={torrent.infoHash} infoHash={torrent.infoHash} />)}
          </section>
        )}
      </main>
    </div>
  )
}

function DownloadRow({ infoHash }: { infoHash: string }) {
  const navigate = useNavigate()
  const torrent = useTorrentStore((state) => state.downloads.get(infoHash))
  const stats = useTorrentStore((state) => state.progress.get(infoHash))
  const removeTorrent = useTorrentStore((state) => state.removeTorrent)
  if (!torrent) return null
  const percent = Math.min(100, Math.max(0, (stats?.progress ?? 0) * 100))
  const complete = percent >= 99.9
  return (
                <article className="group py-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-white/28">{complete ? <Check className="h-4 w-4 text-teal-300" /> : <Download className="h-4 w-4" />}</div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-[12px] font-medium text-white/72">{torrent.name || 'Resolving download…'}</h2>
                      <p className="mt-1 text-[9px] text-white/26">{formatBytes(torrent.totalSize)} · {torrent.files?.length || 0} file{torrent.files?.length === 1 ? '' : 's'}</p>
                      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.065]"><div className="h-full bg-teal-300 transition-[width] duration-500" style={{ width: percent + '%' }} /></div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 text-[9px] text-white/27">
                        <span className="text-white/48">{complete ? 'Complete' : percent.toFixed(1) + '%'}</span>
                        {stats && !complete && <><span className="flex items-center gap-1 text-teal-300/65"><ArrowDown className="h-3 w-3" />{formatSpeed(stats.downloadSpeed)}</span><span className="flex items-center gap-1"><ArrowUp className="h-3 w-3" />{formatSpeed(stats.uploadSpeed)}</span></>}
                        {stats && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{stats.numPeers}</span>}
                        {stats && <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{formatBytes(stats.downloaded)}</span>}
                      </div>
                    </div>
                    <button onClick={() => navigate('/player/' + torrent.infoHash)} className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[10px] font-semibold text-[#17191b] hover:bg-white/90"><Play className="h-3 w-3 fill-current" /> Play</button>
                    <button onClick={() => void removeTorrent(torrent.infoHash)} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/18 opacity-0 hover:bg-white/[0.05] hover:text-red-300 group-hover:opacity-100" title="Remove transfer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </article>
  )
}
