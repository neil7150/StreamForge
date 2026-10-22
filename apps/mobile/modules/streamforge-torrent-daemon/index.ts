import { requireOptionalNativeModule } from 'expo'

export type TorrentDaemonNativeModule = {
  getProtocolVersion(): number
  startDaemon(port: number): Promise<string>
  stopDaemon(): Promise<void>
  prepareSession(id: string, magnetURI: string, fileIndex: number, season: number, episode: number): Promise<string>
  selectFile(id: string, fileIndex: number): Promise<string>
  cancelSession(id: string): Promise<void>
  getStats(id: string): Promise<string>
  getCacheSize(): Promise<number>
  clearCache(): Promise<void>
}

export default requireOptionalNativeModule<TorrentDaemonNativeModule>('TorrentDaemon')
