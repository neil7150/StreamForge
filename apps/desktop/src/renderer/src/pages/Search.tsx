import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowDown, Check, ChevronDown, Film, Loader2, Play, Search as SearchIcon, SlidersHorizontal, Users } from 'lucide-react'
import clsx from 'clsx'
import { searchTorrents, type TorrentSearchResult } from '../lib/torrentSearch'
import { useTorrentStore } from '../stores/torrentStore'
import SmartSearchInput from '../components/ui/SmartSearchInput'
import { extractInfoHash } from '../lib/utils'

type SortMode = 'health' | 'size' | 'seeders'

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'health', label: 'Best source' },
  { value: 'seeders', label: 'Most seeders' },
  { value: 'size', label: 'Smallest file' }
]

function compatibilityFor(name: string) {
  const normalized = name.toLowerCase()
  const directVideo = /h\.?264|x264|avc/.test(normalized)
  const directAudio = /aac|mp3|opus/.test(normalized)
  if (directVideo && directAudio) return 'Direct play'
  if (/hevc|h\.?265|x265|ac3|eac3|dts/.test(normalized)) return 'Compatibility mode'
  return 'Auto detect'
}

function sourceScore(result: TorrentSearchResult) {
  if (result.qualityScore !== undefined) return result.qualityScore
  const seedScore = Math.min(70, Math.log10(Math.max(1, result.seeders)) * 24)
  const ratioScore = Math.min(20, result.seeders / Math.max(1, result.leechers + 1))
  const videoBonus = /movie|video|tv|anime|hd/i.test(result.category) ? 10 : 0
  return Math.round(Math.min(100, seedScore + ratioScore + videoBonus))
}

function isVideoResult(result: TorrentSearchResult) {
  const value = (result.category + ' ' + result.name).toLowerCase()
  return /movie|video|tv|anime|1080p|2160p|720p|bluray|web[- .]?dl|webrip|h\.?264|h\.?265|x264|x265/.test(value)
    && !/\b(app|software|game|music|audio book|xxx|adult)\b/.test(result.category.toLowerCase())
}

export default function Search() {
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = location.state as { query?: string } | null
  const [query, setQuery] = useState(locationState?.query ?? '')
  const [results, setResults] = useState<TorrentSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [category, setCategory] = useState('All')
  const [sortMode, setSortMode] = useState<SortMode>('health')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const requestRef = useRef(0)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const addDownload = useTorrentStore((state) => state.addDownload)
  const addTorrent = useTorrentStore((state) => state.addTorrent)
  const storeError = useTorrentStore((state) => state.error)
  const clearError = useTorrentStore((state) => state.clearError)

  const runSearch = useCallback(async (value: string) => {
    const safeQuery = value.trim()
    const requestId = ++requestRef.current
    if (!safeQuery) {
      setResults([]); setSearchError(null); setNotice(null); setLoading(false); return
    }
    setLoading(true); setSearchError(null); setNotice(null); setCategory('All')
    try {
      const response = await searchTorrents(safeQuery)
      if (requestId !== requestRef.current) return
      const videoResults = response.results.filter(isVideoResult)
      setResults(videoResults)
      const unavailable = response.providers.filter((provider) => provider.status !== 'ok')
      if (videoResults.length === 0) {
        setSearchError(unavailable.length === response.providers.length && response.providers.length > 0
          ? 'The source providers are unavailable. Check your connection and try again.'
          : 'No playable video sources were found for this search.')
      } else if (response.cache === 'stale') {
        setNotice('Live source providers are temporarily unavailable. Showing recent cached results.')
      } else if (unavailable.length > 0) {
        setNotice(unavailable.map((provider) => provider.status === 'cooldown'
          ? `${provider.name} temporarily paused`
          : `${provider.name} unavailable`).join(', ') + '. Other sources are shown.')
      }
    } catch (error) {
      if (requestId !== requestRef.current) return
      console.error('[Search] Torrent search failed:', error)
      setResults([])
      setSearchError('Search failed. Check your connection and try again.')
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query.trim()) {
      requestRef.current += 1
      setResults([]); setSearchError(null); setNotice(null); setLoading(false); return
    }
    debounceRef.current = setTimeout(() => void runSearch(query), 550)
    return () => clearTimeout(debounceRef.current)
  }, [query, runSearch])

  useEffect(() => {
    if (!sortMenuOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!sortMenuRef.current?.contains(event.target as Node)) setSortMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSortMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [sortMenuOpen])

  const categories = useMemo(() => ['All', ...Array.from(new Set(results.map((result) => result.category))).slice(0, 7)], [results])
  const visibleResults = useMemo(() => {
    const filtered = category === 'All' ? [...results] : results.filter((result) => result.category === category)
    return filtered.sort((left, right) => {
      if (sortMode === 'size') return left.sizeBytes - right.sizeBytes
      if (sortMode === 'seeders') return right.seeders - left.seeders
      return sourceScore(right) - sourceScore(left)
    })
  }, [category, results, sortMode])

  const handleMagnet = useCallback((magnetURI: string) => {
    clearError()
    const hash = extractInfoHash(magnetURI)
    if (!hash) return
    void addTorrent(magnetURI).catch(() => {})
    navigate('/player/' + hash)
  }, [addTorrent, clearError, navigate])

  const streamResult = (result: TorrentSearchResult) => {
    const hash = extractInfoHash(result.magnetURI)
    if (!hash) return
    void addTorrent(result.magnetURI).catch(() => {})
    navigate('/player/' + hash)
  }

  const downloadResult = async (result: TorrentSearchResult) => {
    setDownloadingId(result.id)
    try { await addDownload(result.magnetURI); navigate('/downloads') }
    catch { /* Store error is shown by the search input. */ }
    finally { setDownloadingId(null) }
  }

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto w-full max-w-[1160px] px-10 pb-14 pt-9">
        <header>
          <h1 className="text-[22px] font-semibold tracking-[-0.025em] text-white/90">Discover</h1>
          <p className="mt-1.5 text-[11px] text-white/32">Search and compare playable video sources.</p>
        </header>

        <div className="mt-7 max-w-[820px]">
          <SmartSearchInput onMagnet={handleMagnet} onSearch={setQuery} initialValue={query} error={storeError} searchPlaceholder="Search a title or paste a magnet link" autoFocus />
        </div>

        {results.length > 0 && (
          <div className="mt-7 flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="scrollbar-none flex max-w-[75%] gap-5 overflow-x-auto">
              {categories.map((item) => (
                <button key={item} onClick={() => setCategory(item)} className={clsx('shrink-0 text-[10px] font-medium', category === item ? 'text-teal-300' : 'text-white/32 hover:text-white/65')}>{item}</button>
              ))}
            </div>
            <div ref={sortMenuRef} className="relative flex items-center gap-2 text-[10px] text-white/30">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <button
                type="button"
                onClick={() => setSortMenuOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={sortMenuOpen}
                className="flex h-8 min-w-[126px] items-center justify-between gap-3 rounded-lg border border-white/[0.09] bg-[#151719] px-3 text-[10px] text-white/62 hover:border-white/[0.15] hover:text-white/82"
              >
                {SORT_OPTIONS.find((option) => option.value === sortMode)?.label}
                <ChevronDown className={clsx('h-3 w-3 transition-transform', sortMenuOpen && 'rotate-180')} />
              </button>
              {sortMenuOpen && (
                <div role="listbox" aria-label="Sort sources" className="absolute right-0 top-full z-50 mt-2 w-[150px] overflow-hidden rounded-lg border border-white/[0.1] bg-[#17191b] p-1 shadow-2xl shadow-black/60">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={sortMode === option.value}
                      onClick={() => { setSortMode(option.value); setSortMenuOpen(false) }}
                      className={clsx(
                        'flex h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-[10px]',
                        sortMode === option.value
                          ? 'bg-white/[0.08] text-white/90'
                          : 'text-white/52 hover:bg-white/[0.05] hover:text-white/78'
                      )}
                    >
                      {option.label}
                      <Check className={clsx('h-3 w-3 text-teal-300', sortMode === option.value ? 'opacity-100' : 'opacity-0')} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {notice && <p className="mt-4 text-[10px] text-amber-200/65">{notice}</p>}

        {loading && <div className="flex min-h-[300px] flex-col items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-teal-300" /><p className="mt-3 text-[10px] text-white/30">Checking sources…</p></div>}

        {!loading && !query.trim() && (
          <div className="flex min-h-[330px] flex-col items-center justify-center text-center">
            <SearchIcon className="h-6 w-6 text-white/16" />
            <h2 className="mt-4 text-[13px] font-medium text-white/58">Search video sources</h2>
            <p className="mt-1.5 text-[10px] text-white/26">Use a title, release name, or magnet link.</p>
          </div>
        )}

        {!loading && searchError && query.trim() && (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-center"><Film className="h-6 w-6 text-white/15" /><p className="mt-4 max-w-md text-[12px] text-white/55">{searchError}</p><button onClick={() => void runSearch(query)} className="mt-4 rounded-lg border border-white/[0.09] px-3 py-2 text-[10px] text-white/55 hover:bg-white/[0.05]">Try again</button></div>
        )}

        {!loading && visibleResults.length > 0 && (
          <section className="mt-5">
            <p className="mb-3 text-[10px] text-white/25">{visibleResults.length} source{visibleResults.length === 1 ? '' : 's'}</p>
            <div className="divide-y divide-white/[0.055] border-y border-white/[0.06]">
              {visibleResults.map((result) => (
                <article key={result.id} className="flex min-w-0 items-center gap-5 py-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[12px] font-medium text-white/76">{result.name}</h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-white/28">
                      <span className="flex items-center gap-1 text-teal-300/70"><Users className="h-3 w-3" />{result.seeders} seeds</span>
                      <span>{result.size}</span><span>{compatibilityFor(result.name)}</span><span>{result.provider}</span>
                    </div>
                  </div>
                  <button onClick={() => streamResult(result)} className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[10px] font-semibold text-[#17191b] hover:bg-white/90"><Play className="h-3 w-3 fill-current" /> Stream</button>
                  <button onClick={() => void downloadResult(result)} disabled={downloadingId === result.id} className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 text-[10px] font-medium text-white/48 hover:bg-white/[0.05] hover:text-white/75 disabled:opacity-40">{downloadingId === result.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowDown className="h-3 w-3" />} Save</button>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
