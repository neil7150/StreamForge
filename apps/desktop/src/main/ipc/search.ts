import { ipcMain } from 'electron'
import { requireSearchQuery } from './validation'
import { searchTorrentProviders } from '../search/provider-search'

export function registerSearchHandlers(): void {
  ipcMain.handle('search:torrents', async (_, query: string) => {
    const safeQuery = requireSearchQuery(query)
    return searchTorrentProviders(safeQuery)
  })
}
