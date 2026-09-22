import { create } from 'zustand'
import { getTorrentAPI } from './torrent-api-adapter'

export interface AppState {
  sidebarCollapsed: boolean
  isMaximized: boolean
  cacheSize: number

  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setMaximized: (maximized: boolean) => void
  setCacheSize: (size: number) => void
  refreshCacheSize: () => Promise<void>
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  isMaximized: false,
  cacheSize: 0,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setMaximized: (maximized) => set({ isMaximized: maximized }),
  setCacheSize: (size) => set({ cacheSize: size }),

  refreshCacheSize: async () => {
    try {
      const api = getTorrentAPI()
      const size = await api.getCacheSize()
      set({ cacheSize: size })
    } catch {
      // Silently fail
    }
  }
}))
