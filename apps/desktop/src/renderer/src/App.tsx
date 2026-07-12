import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import TitleBar from './components/ui/TitleBar'
import Sidebar from './components/ui/Sidebar'
import Home from './pages/Home'
import Browse from './pages/Browse'
import MovieDetail from './pages/MovieDetail'
import Search from './pages/Search'
import Watchlist from './pages/Watchlist'
import History from './pages/History'
import Downloads from './pages/Downloads'
import Player from './pages/Player'
import Settings from './pages/Settings'
import { useTorrentEvents } from './hooks/useTorrent'
import { useAppStore } from './stores/appStore'

export default function App() {
  // Subscribe to torrent events globally
  useTorrentEvents()

  const refreshCacheSize = useAppStore((s) => s.refreshCacheSize)

  // Periodically refresh cache size
  useEffect(() => {
    refreshCacheSize()
    const interval = setInterval(refreshCacheSize, 30_000)
    return () => clearInterval(interval)
  }, [refreshCacheSize])

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg-primary)]">
      {/* Title Bar */}
      <TitleBar />

      {/* Main Layout */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <Sidebar />

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-hidden">
          <div className="h-full animate-[fade-in_0.3s_ease-out]">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/browse" element={<Browse />} />
              <Route path="/movie/:slug" element={<MovieDetail />} />
              <Route path="/search" element={<Search />} />
              <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/history" element={<History />} />
              <Route path="/downloads" element={<Downloads />} />
              <Route path="/player/:infoHash" element={<Player />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  )
}
