import { ipcMain } from 'electron'

export function registerSearchHandlers(): void {
  ipcMain.handle('search:nyaa', async (_, query: string) => {
    try {
      const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(query.trim())}`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Nyaa HTTP error: ${response.status}`)
      }

      const xml = await response.text()
      
      // Simple Regex parsing for RSS items
      const itemRegex = /<item>([\s\S]*?)<\/item>/g
      const items: any[] = []
      
      let match
      while ((match = itemRegex.exec(xml)) !== null) {
        const itemXml = match[1]
        
        const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || itemXml.match(/<title>(.*?)<\/title>/)
        const seedersMatch = itemXml.match(/<nyaa:seeders>(\d+)<\/nyaa:seeders>/)
        const leechersMatch = itemXml.match(/<nyaa:leechers>(\d+)<\/nyaa:leechers>/)
        const infoHashMatch = itemXml.match(/<nyaa:infoHash>([a-fA-F0-9]{40})<\/nyaa:infoHash>/)
        const sizeMatch = itemXml.match(/<nyaa:size>(.*?)<\/nyaa:size>/)
        const categoryMatch = itemXml.match(/<nyaa:category>(.*?)<\/nyaa:category>/)
        const dateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)

        if (titleMatch && infoHashMatch) {
          items.push({
            id: `nyaa-${infoHashMatch[1]}`,
            name: titleMatch[1].trim(),
            magnetURI: `magnet:?xt=urn:btih:${infoHashMatch[1]}`, // Base URI, trackers will be appended on frontend
            seeders: seedersMatch ? parseInt(seedersMatch[1], 10) : 0,
            leechers: leechersMatch ? parseInt(leechersMatch[1], 10) : 0,
            size: sizeMatch ? sizeMatch[1] : '0 B',
            sizeBytes: 0, // We have a pre-formatted size string from Nyaa
            category: categoryMatch ? categoryMatch[1] : 'Anime',
            added: dateMatch ? new Date(dateMatch[1]).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''
          })
        }
      }
      
      return items
    } catch (err) {
      console.error('[SearchIPC] Nyaa search failed:', err)
      return []
    }
  })
}
