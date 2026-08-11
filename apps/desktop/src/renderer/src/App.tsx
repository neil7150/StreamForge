import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import TitleBar from './components/ui/TitleBar'
import Sidebar from './components/ui/Sidebar'
import Home from './pages/Home'
import Browse from './pages/Browse'
import MovieDetail from './pages/MovieDetail'
import Search from './pages/Search'
import SeriesDetail from './pages/SeriesDetail'
import Watchlist from './pages/Watchlist'
import History from './pages/History'
import Downloads from './pages/Downloads'
import Player from './pages/Player'
import Settings from './pages/Settings'
import { useTorrentEvents } from './hooks/useTorrent'
import { useAppStore } from './stores/appStore'

export default function App() {
  useTorrentEvents()

  const refreshCacheSize = useAppStore((state) => state.refreshCacheSize)
  const location = useLocation()
  const isPlayer = location.pathname.startsWith('/player/')

  useEffect(() => {
    refreshCacheSize()
    const interval = setInterval(refreshCacheSize, 30_000)
    return () => clearInterval(interval)
  }, [refreshCacheSize])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg-primary)]">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        {!isPlayer && <Sidebar />}
        <main className="min-w-0 flex-1 overflow-hidden">
          <div key={location.pathname} className="h-full animate-[fade-in_0.16s_ease-out]">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/browse" element={<Browse />} />
              <Route path="/movie/:slug" element={<MovieDetail />} />
              <Route path="/search" element={<Search />} />
              <Route path="/series/:seriesId" element={<SeriesDetail />} />
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
