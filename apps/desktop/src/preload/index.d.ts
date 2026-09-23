export type TorrentMode = 'stream' | 'download'

export interface TorrentFile {
  name: string
  path: string
  size: number
  type: string
}

export interface TorrentInfo {
  infoHash: string
  name: string
  files: TorrentFile[]
  totalSize: number
  streamURL: string
  ready: boolean
  mode: TorrentMode
  selectedFileIndex: number | null
  requiresFileSelection: boolean
  fileSelectionMessage: string | null
}

export interface QueuedDownloadResult {
  infoHash: string
  queued: boolean
}

export interface PreferredEpisodeFile {
  seasonNumber: number
  episodeNumber: number
  fileIndex?: number
  absoluteEpisodeNumber?: number
  absoluteEpisodeOnly?: boolean
  seriesTitles?: string[]
}

export type TorrentProviderName =
  | 'APIBay'
  | 'Nyaa'
  | 'AnimeTosho'
  | 'TokyoTosho'
  | 'SubsPlease'
  | 'AniDex'
  | 'YTS'
  | 'EZTV'
  | 'Knaben'
  | 'Torznab'
  | 'StremioAddon'
  | 'InternetArchive'
  | '1337x'

export interface TorrentSearchResult {
  id: string
  name: string
  magnetURI: string
  seeders: number
  leechers: number
  size: string
  sizeBytes: number
  category: string
  added: string
  provider: TorrentProviderName
  qualityScore?: number
  fileIndex?: number
}

export interface TorrentProviderStatus {
  name: TorrentProviderName
  status: 'ok' | 'error' | 'cooldown'
  count: number
  error?: string
  latencyMs?: number
  consecutiveFailures?: number
  retryAt?: number
  fromCache?: boolean
}

export interface TorrentSearchResponse {
  results: TorrentSearchResult[]
  providers: TorrentProviderStatus[]
  cache?: 'miss' | 'fresh' | 'stale'
}

export interface EpisodeTorrentSearchRequest {
  seriesTitle: string
  seasonNumber: number
  episodeNumber: number
  episodeTitle?: string
  imdbId?: string
  seriesAliases?: string[]
  absoluteEpisodeNumber?: number
  absoluteEpisodeOnly?: boolean
  torznabUrl?: string
  torznabApiKey?: string
  torznabEndpoints?: Array<{ url: string; apiKey?: string }>
  stremioAddonUrls?: string[]
}

export interface MovieTorrentSearchRequest {
  title: string
  year?: number
  imdbId?: string
  torznabUrl?: string
  torznabApiKey?: string
  torznabEndpoints?: Array<{ url: string; apiKey?: string }>
  stremioAddonUrls?: string[]
}

export interface OnlineSubtitleSearchRequest {
  apiKey: string
  query: string
  language?: string
  seasonNumber?: number
  episodeNumber?: number
}

export interface OnlineSubtitleResult {
  id: string
  fileId: number
  fileName: string
  language: string
  release: string | null
  downloadCount: number
}

export interface SeriesSummary {
  id: number
  title: string
  posterUrl: string | null
  year: number | null
  status: string | null
  network: string | null
  type: string | null
  language: string | null
  genres: string[]
  rating: number | null
  summary: string | null
  tvmazeUrl: string | null
  imdbId: string | null
}

export interface SeriesDetails extends SeriesSummary {
  premiered: string | null
  ended: string | null
  runtimeMinutes: number | null
  officialSite: string | null
  originalImageUrl: string | null
}

export interface SeasonSummary {
  id: number
  seriesId: number
  number: number
  name: string | null
  episodeCount: number | null
  premiereDate: string | null
  endDate: string | null
  network: string | null
  posterUrl: string | null
  summary: string | null
  absoluteEpisodeStart?: number
  absoluteEpisodeEnd?: number
}

export interface EpisodeSummary {
  id: number
  seasonId: number
  seasonNumber: number
  episodeNumber: number | null
  title: string
  type: string | null
  airDate: string | null
  airStamp: string | null
  runtimeMinutes: number | null
  stillUrl: string | null
  summary: string | null
  tvmazeUrl: string | null
}

export interface AnimeSearchMetadata {
  aliases: string[]
  episodeCount: number | null
}

export interface MovieSummary {
  id: string
  title: string
  year: number | null
  posterUrl: string | null
  rating: number | null
  genres: string[]
  language: string | null
  imdbId: string | null
}

export interface MovieDetails extends MovieSummary {
  summary: string | null
  runtimeMinutes: number | null
  backdropUrl: string | null
  contentRating: string | null
  ytsUrl: string | null
}
export interface TorrentProgress {
  infoHash: string
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  numPeers: number
  downloaded: number
  uploaded: number
  totalSize: number
  timeRemaining: number
  ratio: number
  bufferProgress: number
  mode: TorrentMode
  peerConnections: PeerConnectionDiagnostics
}

export interface PeerConnectionDiagnostics {
  discovered: number
  pending: number
  connected: number
  fastTcpFallbacksArmed: number
  bySource: Record<'tracker' | 'dht' | 'lsd' | 'pex' | 'manual' | 'unknown', number>
  byTransport: Record<'tcp' | 'utp' | 'webrtc' | 'webseed' | 'unknown', number>
}

export interface MediaAudioTrack {
  index: number
  codec: string
  language: string
  title: string | null
  channels: number
  channelLayout: string | null
  isDefault: boolean
}

export interface MediaSubtitleTrack {
  index: number
  codec: string
  language: string
  title: string | null
  isDefault: boolean
  textBased: boolean
}

export interface MediaInfo {
  videoCodec: string | null
  audioCodec: string | null
  audioTracks: MediaAudioTrack[]
  subtitleTracks: MediaSubtitleTrack[]
  duration: number
  width: number
  height: number
  needsVideoTranscode: boolean
  needsAudioTranscode: boolean
  needsTranscode: boolean
  chapters?: MediaChapter[]
}

export interface MediaChapter {
  start: number
  end: number
  title: string | null
}

export interface TorrentAPI {
  // Streaming (ephemeral)
  addTorrent: (magnetURI: string, preferredEpisode?: PreferredEpisodeFile) => Promise<TorrentInfo>
  getStreams: () => Promise<TorrentInfo[]>
  cleanupStream: (infoHash: string) => Promise<void>

  // Downloads (persistent)
  addDownload: (magnetURI: string) => Promise<TorrentInfo>
  queueDownload: (magnetURI: string, activeStreamInfoHash?: string) => Promise<QueuedDownloadResult>
  getDownloads: () => Promise<TorrentInfo[]>
  openDownloadFolder: () => Promise<void>

  // Shared
  removeTorrent: (infoHash: string) => Promise<void>
  getTorrents: () => Promise<TorrentInfo[]>
  getStreamURL: (infoHash: string) => Promise<string>
  getMediaInfo: (infoHash: string) => Promise<MediaInfo | null>
  selectFile: (infoHash: string, fileIndex: number) => Promise<string>
  notifySeek: (infoHash: string, position: number) => Promise<void>
  updatePlaybackPosition: (infoHash: string, currentTime: number, duration: number) => Promise<void>

  // Events
  onTorrentProgress: (callback: (data: TorrentProgress) => void) => () => void
  onTorrentReady: (callback: (data: TorrentInfo) => void) => () => void
  onTorrentError: (callback: (data: { infoHash: string; error: string }) => void) => () => void

  // Search
  searchTorrents: (query: string) => Promise<TorrentSearchResponse>
  searchEpisodeTorrents: (request: EpisodeTorrentSearchRequest) => Promise<TorrentSearchResponse>
  searchMovieTorrents: (request: MovieTorrentSearchRequest) => Promise<TorrentSearchResponse>
  searchOnlineSubtitles: (request: OnlineSubtitleSearchRequest) => Promise<OnlineSubtitleResult[]>
  downloadOnlineSubtitle: (apiKey: string, fileId: number) => Promise<string>

  // Series catalog
  searchSeries: (query: string) => Promise<SeriesSummary[]>
  getPopularSeries: () => Promise<SeriesSummary[]>
  getSeries: (seriesId: number) => Promise<SeriesDetails>
  getSeasons: (seriesId: number) => Promise<SeasonSummary[]>
  getSeasonEpisodes: (seasonId: number) => Promise<EpisodeSummary[]>
  getAnimeSearchMetadata: (title: string) => Promise<AnimeSearchMetadata | null>
  searchMovies: (query: string) => Promise<MovieSummary[]>
  getPopularMovies: () => Promise<MovieSummary[]>
  getMovie: (movieId: string) => Promise<MovieDetails>

  // Cache
  getCacheSize: () => Promise<number>
  clearCache: () => Promise<void>

  // Window
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  isMaximized: () => Promise<boolean>
  onWindowMaximized: (callback: (maximized: boolean) => void) => () => void
}

declare global {
  interface Window {
    torrentAPI: TorrentAPI
  }
}
