/**
 * Cache IPC Handlers — Exposes cache management to the renderer.
 *
 * IPC Channels:
 *   cache:get-size → returns total cache size in bytes
 *   cache:clear    → clears all cached torrent data
 */

import { ipcMain } from 'electron'
import type { CacheManager } from '../torrent/cache-manager'
import type { TorrentManager } from '../torrent/manager'

export function setupCacheIPC(cacheManager: CacheManager, torrentManager: TorrentManager): void {
  ipcMain.handle('cache:get-size', async () => {
    try {
      return await cacheManager.getCacheSize()
    } catch (error) {
      console.error('[IPC cache:get-size] Error:', (error as Error).message)
      throw error
    }
  })

  ipcMain.handle('cache:clear', async () => {
    try {
      await torrentManager.cleanupAllStreams()
      await cacheManager.clearCache()
    } catch (error) {
      console.error('[IPC cache:clear] Error:', (error as Error).message)
      throw error
    }
  })

  console.log('[IPC] Cache handlers registered')
}
