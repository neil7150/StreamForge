import { NavLink, useLocation } from 'react-router-dom'
import {
  Home,
  Compass,
  Search,
  Bookmark,
  Clock,
  Download,
  Settings,
  ChevronLeft,
  ChevronRight,
  Activity
} from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../../stores/appStore'
import { useTorrentStore } from '../../stores/torrentStore'
import { useUserDataStore } from '../../stores/userDataStore'
import { formatBytes } from '../../lib/utils'

interface NavItem {
  label: string
  path: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Browse', path: '/browse', icon: Compass },
  { label: 'Search', path: '/search', icon: Search },
  { label: 'Watchlist', path: '/watchlist', icon: Bookmark },
  { label: 'History', path: '/history', icon: Clock },
  { label: 'Downloads', path: '/downloads', icon: Download },
  { label: 'Settings', path: '/settings', icon: Settings }
]

export default function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const cacheSize = useAppStore((s) => s.cacheSize)
  const downloads = useTorrentStore((s) => s.downloads)
  const watchlistCount = useUserDataStore((s) => s.watchlist.length)
  const location = useLocation()

  const activeTorrentCount = downloads.size

  return (
    <aside
      className={clsx(
        'relative flex shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]/80 backdrop-blur-xl transition-all duration-300',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] shadow-md transition-all duration-300 hover:scale-110 hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)]"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>

      {/* Navigation */}
      <nav className="mt-4 flex flex-1 flex-col gap-1.5 px-3">
        {navItems.map((item) => {
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path)

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={clsx(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300',
                isActive
                  ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] shadow-[inset_0_0_12px_var(--color-accent-glow)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] hover:translate-x-1',
                collapsed && 'justify-center px-0 hover:translate-x-0'
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[var(--color-accent)] shadow-[var(--shadow-glow)] transition-all duration-300" />
              )}

              <item.icon
                className={clsx(
                  'h-[18px] w-[18px] shrink-0 transition-colors duration-300',
                  isActive ? 'text-[var(--color-accent)] drop-shadow-[0_0_8px_var(--color-accent-glow)]' : ''
                )}
              />

              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}

              {/* Downloads badge */}
              {item.path === '/downloads' && activeTorrentCount > 0 && (
                <span
                  className={clsx(
                    'flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-accent)] text-[10px] font-bold text-white',
                    collapsed && 'absolute -right-0.5 -top-0.5 h-4 min-w-4 text-[9px]'
                  )}
                >
                  {activeTorrentCount}
                </span>
              )}

              {/* Watchlist badge */}
              {item.path === '/watchlist' && watchlistCount > 0 && (
                <span
                  className={clsx(
                    'flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/80 text-[10px] font-bold text-white',
                    collapsed && 'absolute -right-0.5 -top-0.5 h-4 min-w-4 text-[9px]'
                  )}
                >
                  {watchlistCount}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom section — active torrent indicator */}
      <div
        className={clsx(
          'border-t border-[var(--color-border)] p-3',
          collapsed && 'flex flex-col items-center px-1'
        )}
      >
        {activeTorrentCount > 0 && (
          <div
            className={clsx(
              'flex items-center gap-2 rounded-lg bg-[var(--color-accent)]/5 p-2',
              collapsed && 'flex-col gap-1 p-1.5'
            )}
          >
            <Activity className="h-4 w-4 shrink-0 text-[var(--color-accent)] animate-pulse" />
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--color-text-primary)]">
                  {activeTorrentCount} active
                </p>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Cache: {formatBytes(cacheSize)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
