import { NavLink, useLocation } from 'react-router-dom'
import { Home, Search, Library, Download, Settings, Circle } from 'lucide-react'
import clsx from 'clsx'
import { useTorrentStore } from '../../stores/torrentStore'

const navItems = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Discover', path: '/search', icon: Search },
  { label: 'Library', path: '/history', icon: Library },
  { label: 'Downloads', path: '/downloads', icon: Download },
  { label: 'Settings', path: '/settings', icon: Settings }
]

export default function Sidebar() {
  const downloads = useTorrentStore((state) => state.downloads)
  const streams = useTorrentStore((state) => state.streams)
  const location = useLocation()
  const activeCount = downloads.size + streams.size

  return (
    <aside className="flex w-[196px] shrink-0 flex-col border-r border-white/[0.06] bg-[#111315] px-3 py-4">
      <nav className="space-y-1">
        {navItems.map((item) => {
          const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={clsx(
                'flex h-10 items-center gap-3 rounded-lg px-3 text-[12px] font-medium transition-colors',
                active ? 'bg-white/[0.07] text-white' : 'text-white/42 hover:bg-white/[0.04] hover:text-white/75'
              )}
            >
              <item.icon className={clsx('h-4 w-4', active && 'text-teal-300')} />
              <span className="flex-1">{item.label}</span>
              {item.path === '/downloads' && downloads.size > 0 && (
                <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[9px] text-white/65">{downloads.size}</span>
              )}
            </NavLink>
          )
        })}
      </nav>
      <div className="mt-auto flex items-center gap-2 border-t border-white/[0.06] px-3 pt-4 text-[10px] text-white/30">
        <Circle className={clsx('h-2.5 w-2.5 fill-current', activeCount ? 'text-teal-300' : 'text-white/20')} />
        {activeCount ? activeCount + ' active' : 'Idle'}
      </div>
    </aside>
  )
}