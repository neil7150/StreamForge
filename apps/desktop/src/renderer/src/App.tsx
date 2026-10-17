import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import TitleBar from './components/ui/TitleBar'
import Sidebar from './components/ui/Sidebar'
import CommandPalette from './components/ui/CommandPalette'
import ShortcutsOverlay from './components/ui/ShortcutsOverlay'
import Home from './pages/Home'
const Browse = lazy(() => import('./pages/Browse'))
const MovieDetail = lazy(() => import('./pages/MovieDetail'))
const Search = lazy(() => import('./pages/Search'))
const SeriesDetail = lazy(() => import('./pages/SeriesDetail'))
const Watchlist = lazy(() => import('./pages/Watchlist'))
const History = lazy(() => import('./pages/History'))
const Downloads = lazy(() => import('./pages/Downloads'))
const Player = lazy(() => import('./pages/Player'))
const Settings = lazy(() => import('./pages/Settings'))
const Admin = lazy(() => import('./pages/Admin'))
import { useTorrentEvents } from './hooks/useTorrent'
import { useAppStore } from './stores/appStore'
import { useAuthStore } from './stores/authStore'
import { useUserDataStore } from './stores/userDataStore'

export default function App() {
  useTorrentEvents()

  const refreshCacheSize = useAppStore((state) => state.refreshCacheSize)
  const location = useLocation()
  const isPlayer = location.pathname.startsWith('/player/')
  const loadSession = useAuthStore((state) => state.loadSession)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const syncToCloud = useUserDataStore((state) => state.syncToCloud)

  useEffect(() => {
    loadSession()
  }, [loadSession])

  useEffect(() => {
    if (!isAuthenticated) return
    const interval = setInterval(() => {
      syncToCloud().catch(() => {})
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [isAuthenticated, syncToCloud])

  useEffect(() => {
    refreshCacheSize()
    const interval = setInterval(refreshCacheSize, 30_000)
    return () => clearInterval(interval)
  }, [refreshCacheSize])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg-primary)]">
      <TitleBar />
      <CommandPalette />
      <ShortcutsOverlay />
      <div className="app-shell flex min-h-0 flex-1">
        {!isPlayer && <Sidebar />}
        <main className="app-content min-w-0 flex-1 overflow-hidden" aria-label="Page content">
          <div className="h-full">
            <Suspense fallback={<div className="route-loading" role="status">Opening page…</div>}>
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
              <Route path="/admin" element={<Admin />} />
            </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
