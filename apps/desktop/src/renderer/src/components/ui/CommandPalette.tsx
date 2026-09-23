import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Film,
  Tv,
  Settings,
  Clock,
  Bookmark,
  Download,
  Shield,
  Compass,
  Home,
  Keyboard,
  X,
  Sparkles,
  Link2
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '../../lib/api'
import { isValidMagnet, extractInfoHash } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'
import { useTorrentStore } from '../../stores/torrentStore'

interface PaletteItem {
  id: string
  title: string
  subtitle?: string
  icon: React.ReactNode
  badge?: string
  action: () => void
}

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchResults, setSearchResults] = useState<PaletteItem[]>([])
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const user = useAuthStore((state) => state.user)
  const addTorrent = useTorrentStore((state) => state.addTorrent)

  // Global shortcut listener for Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Navigation Items
  const navItems: PaletteItem[] = [
    {
      id: 'nav-home',
      title: 'Home',
      subtitle: 'Overview & recently watched',
      icon: <Home className="h-4 w-4 text-teal-300" />,
      action: () => { navigate('/'); setIsOpen(false) }
    },
    {
      id: 'nav-browse',
      title: 'Browse Catalog',
      subtitle: 'Explore popular movies and TV series',
      icon: <Compass className="h-4 w-4 text-cyan-300" />,
      action: () => { navigate('/browse'); setIsOpen(false) }
    },
    {
      id: 'nav-search',
      title: 'Search Torrents',
      subtitle: 'Search across all indexed P2P trackers',
      icon: <Search className="h-4 w-4 text-sky-300" />,
      action: () => { navigate('/search'); setIsOpen(false) }
    },
    {
      id: 'nav-watchlist',
      title: 'Watchlist',
      subtitle: 'Your saved movies and series',
      icon: <Bookmark className="h-4 w-4 text-amber-300" />,
      action: () => { navigate('/watchlist'); setIsOpen(false) }
    },
    {
      id: 'nav-history',
      title: 'History',
      subtitle: 'Resume previous playback sessions',
      icon: <Clock className="h-4 w-4 text-indigo-300" />,
      action: () => { navigate('/history'); setIsOpen(false) }
    },
    {
      id: 'nav-downloads',
      title: 'Downloads',
      subtitle: 'View completed and active downloads',
      icon: <Download className="h-4 w-4 text-emerald-300" />,
      action: () => { navigate('/downloads'); setIsOpen(false) }
    },
    {
      id: 'nav-settings',
      title: 'Settings',
      subtitle: 'Playback, audio, accounts and plugins',
      icon: <Settings className="h-4 w-4 text-slate-300" />,
      action: () => { navigate('/settings'); setIsOpen(false) }
    },
    {
      id: 'nav-shortcuts',
      title: 'Keyboard Shortcuts Reference',
      subtitle: 'View playback and navigation keyboard controls',
      icon: <Keyboard className="h-4 w-4 text-teal-300" />,
      action: () => {
        setIsOpen(false)
        window.dispatchEvent(new CustomEvent('open-shortcuts'))
      }
    },
    ...(user?.role === 'admin' ? [{
      id: 'nav-admin',
      title: 'Admin Content Portal',
      subtitle: 'Manage catalog movies, series and magnet links',
      icon: <Shield className="h-4 w-4 text-purple-300" />,
      badge: 'Admin',
      action: () => { navigate('/admin'); setIsOpen(false) }
    }] : [])
  ]

  // Live search when query changes
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setSearchResults([])
      setLoading(false)
      setSelectedIndex(0)
      return
    }

    // Check if magnet link
    if (isValidMagnet(trimmed)) {
      const hash = extractInfoHash(trimmed)
      setSearchResults([
        {
          id: 'magnet-play',
          title: 'Stream Magnet Link',
          subtitle: `Hash: ${hash ? hash.slice(0, 16) + '…' : trimmed.slice(0, 32) + '…'}`,
          icon: <Link2 className="h-4 w-4 text-teal-300" />,
          badge: 'P2P Stream',
          action: () => {
            if (hash) {
              void addTorrent(trimmed).catch(() => {})
              navigate('/player/' + hash)
            }
            setIsOpen(false)
          }
        }
      ])
      setSelectedIndex(0)
      return
    }

    let cancelled = false
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        // Try backend search first
        let items: PaletteItem[] = []
        try {
          const res = await api.search(trimmed, 'all', 1)
          if (res?.data && res.data.length > 0) {
            items = res.data.slice(0, 8).map((item: any) => ({
              id: `backend-${item.id}`,
              title: item.title,
              subtitle: `${item.type === 'movie' ? 'Movie' : 'Series'}${item.year ? ` · ${item.year}` : ''}${item.rating ? ` · ★ ${item.rating.toFixed(1)}` : ''}`,
              icon: item.type === 'movie' ? <Film className="h-4 w-4 text-teal-300" /> : <Tv className="h-4 w-4 text-purple-300" />,
              badge: item.type === 'movie' ? 'Movie' : 'Series',
              action: () => {
                if (item.type === 'movie') {
                  navigate(`/movie/${encodeURIComponent(item.slug || item.id)}`)
                } else {
                  navigate(`/series/${item.id}`)
                }
                setIsOpen(false)
              }
            }))
          }
        } catch {
          // Backend unavailable, fallback to catalog
        }

        if (items.length === 0 && window.torrentAPI) {
          const [movies, series] = await Promise.allSettled([
            window.torrentAPI.searchMovies(trimmed),
            window.torrentAPI.searchSeries(trimmed)
          ])

          const movieItems = movies.status === 'fulfilled' ? movies.value.slice(0, 4).map((m) => ({
            id: `cat-movie-${m.id}`,
            title: m.title,
            subtitle: `Movie${m.year ? ` · ${m.year}` : ''}${m.rating ? ` · ★ ${m.rating.toFixed(1)}` : ''}`,
            icon: <Film className="h-4 w-4 text-teal-300" />,
            badge: 'Movie',
            action: () => {
              navigate(`/movie/${encodeURIComponent(m.id)}`, { state: { movie: m } })
              setIsOpen(false)
            }
          })) : []

          const seriesItems = series.status === 'fulfilled' ? series.value.slice(0, 4).map((s) => ({
            id: `cat-series-${s.id}`,
            title: s.title,
            subtitle: `Series${s.year ? ` · ${s.year}` : ''}${s.rating ? ` · ★ ${s.rating.toFixed(1)}` : ''}`,
            icon: <Tv className="h-4 w-4 text-purple-300" />,
            badge: 'Series',
            action: () => {
              navigate(`/series/${s.id}`, { state: { series: s } })
              setIsOpen(false)
            }
          })) : []

          items = [...movieItems, ...seriesItems]
        }

        // Add a "Search full trackers for query" option
        items.push({
          id: 'search-trackers',
          title: `Search torrents for "${trimmed}"`,
          subtitle: 'Search across public indexers & trackers',
          icon: <Search className="h-4 w-4 text-white/50" />,
          badge: 'Trackers',
          action: () => {
            navigate('/search', { state: { query: trimmed } })
            setIsOpen(false)
          }
        })

        if (!cancelled) {
          setSearchResults(items)
          setSelectedIndex(0)
        }
      } catch (err) {
        console.warn('[CommandPalette] search error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, navigate, addTorrent])

  const displayedItems = query.trim() ? searchResults : navItems

  // Keyboard navigation inside the palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % (displayedItems.length || 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + (displayedItems.length || 1)) % (displayedItems.length || 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (displayedItems[selectedIndex]) {
        displayedItems[selectedIndex].action()
      }
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.children[selectedIndex] as HTMLElement
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 pt-[14vh] backdrop-blur-md animate-[fade-in_0.15s_ease-out]"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-white/[0.12] bg-[#141619]/95 shadow-2xl shadow-black/80 backdrop-blur-xl animate-[scale-in_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Bar Header */}
        <div className="relative flex items-center border-b border-white/[0.08] px-4 py-3.5">
          <Search className="mr-3 h-5 w-5 text-white/40" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, search movies & shows, or paste magnet..."
            className="w-full bg-transparent text-[14px] text-white/90 placeholder-white/30 outline-none"
            spellCheck={false}
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="ml-2 flex h-6 w-6 items-center justify-center rounded-md text-white/30 hover:bg-white/[0.08] hover:text-white/70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="ml-2 hidden rounded border border-white/[0.15] bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/40 sm:inline-block">
              ESC
            </kbd>
          )}
        </div>

        {/* Category Label */}
        <div className="flex items-center justify-between px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/30 border-b border-white/[0.04] bg-white/[0.01]">
          <span>{query.trim() ? 'Search Results' : 'Quick Navigation'}</span>
          {loading && <span className="flex items-center gap-1 text-teal-300/80"><Sparkles className="h-3 w-3 animate-pulse" /> Searching...</span>}
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-[360px] overflow-y-auto p-2 divide-y divide-transparent"
        >
          {displayedItems.length > 0 ? (
            displayedItems.map((item, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={clsx(
                    'flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left transition-colors',
                    isSelected
                      ? 'bg-white/[0.09] text-white'
                      : 'text-white/70 hover:bg-white/[0.05] hover:text-white/90'
                  )}
                >
                  <div className={clsx(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.04]',
                    isSelected && 'border-teal-300/30 bg-teal-400/10'
                  )}>
                    {item.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium">{item.title}</span>
                      {item.badge && (
                        <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[9px] font-medium text-white/60">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {item.subtitle && (
                      <p className="truncate text-[11px] text-white/35">{item.subtitle}</p>
                    )}
                  </div>
                  {isSelected && (
                    <span className="text-[10px] text-white/40">↵ Select</span>
                  )}
                </button>
              )
            })
          ) : (
            <div className="py-10 text-center text-[12px] text-white/40">
              No results found for "{query}"
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-white/[0.06] bg-black/40 px-4 py-2.5 text-[11px] text-white/35">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-white/[0.15] bg-white/[0.05] px-1.5 py-0.5 text-[9px]">↑</kbd>
              <kbd className="rounded border border-white/[0.15] bg-white/[0.05] px-1.5 py-0.5 text-[9px]">↓</kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-white/[0.15] bg-white/[0.05] px-1.5 py-0.5 text-[9px]">↵</kbd> Open
            </span>
          </div>
          <span className="text-[10px] text-white/25">Press <kbd className="font-mono text-white/40">Ctrl+K</kbd> anytime</span>
        </div>
      </div>
    </div>
  )
}
