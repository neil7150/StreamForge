import { requireOptionalNativeModule } from 'expo'

export type TorrentDaemonNativeModule = {
  startDaemon(port: number): Promise<string>
  stopDaemon(): Promise<void>
  addMagnet(magnetURI: string, fileIndex: number): Promise<string>
  cleanupStream(infoHash: string): Promise<void>
  getStats(infoHash: string): Promise<string>
}

export default requireOptionalNativeModule<TorrentDaemonNativeModule>('TorrentDaemon')
