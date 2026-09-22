import { NativeModules, Platform } from 'react-native'
import type {
  TorrentAPI,
  TorrentInfo,
  TorrentProgress,
  MediaInfo,
  PreferredEpisodeFile,
  EpisodeTorrentSearchRequest,
  MovieTorrentSearchRequest,
  TorrentSearchResponse,
  OnlineSubtitleSearchRequest,
  OnlineSubtitleResult,
  SeriesSummary,
  SeriesDetails,
  SeasonSummary,
  EpisodeSummary,
  AnimeSearchMetadata,
  MovieSummary,
  MovieDetails
} from '@streamforge/core/types'
import {
  searchMovieTorrents as coreSearchMovieTorrents,
  searchEpisodeTorrents as coreSearchEpisodeTorrents
} from '@streamforge/core/search'
import {
  tvmazeClient,
  movieCatalogClient,
  anilistClient,
  openSubtitlesClient
} from '@streamforge/core/clients'
import { extractInfoHash } from '@streamforge/core/utils'

const { TorrentDaemon } = NativeModules

const progressListeners = new Set<(data: TorrentProgress) => void>()
const readyListeners = new Set<(data: TorrentInfo) => void>()
const errorListeners = new Set<(data: { infoHash: string; error: string }) => void>()

// In-memory active streams for mobile
const activeStreams = new Map<string, TorrentInfo>()

export const mobileTorrentAPI: TorrentAPI = {
  // ─── Streaming ─────────────────────────────────────────────────────────────
  addTorrent: async (magnetURI: string, preferredEpisode?: PreferredEpisodeFile): Promise<TorrentInfo> => {
    const infoHash = extractInfoHash(magnetURI)
    if (!infoHash) {
      throw new Error('Invalid magnet link: missing info hash')
    }
    const defaultStreamURL = `http://127.0.0.1:8888/stream/${infoHash}`

    if (!TorrentDaemon?.addMagnet) {
      throw new Error('Torrent daemon native module is unavailable')
    }

    const streamUrl = await TorrentDaemon.addMagnet(magnetURI, preferredEpisode?.fileIndex ?? -1)
    if (typeof streamUrl !== 'string' || !/^https?:\/\//i.test(streamUrl) || streamUrl.startsWith('ERROR:')) {
      throw new Error(typeof streamUrl === 'string' && streamUrl.startsWith('ERROR:')
        ? streamUrl.slice('ERROR:'.length).trim()
        : 'Torrent daemon returned an invalid stream URL')
    }

    const info: TorrentInfo = {
      infoHash,
      name: 'Torrent Stream',
      files: [],
      totalSize: 0,
      streamURL: streamUrl || defaultStreamURL,
      ready: true,
      mode: 'stream',
      selectedFileIndex: preferredEpisode?.fileIndex ?? null,
      requiresFileSelection: false,
      fileSelectionMessage: null
    }
    activeStreams.set(infoHash, info)
    return info
  },

  getStreams: async (): Promise<TorrentInfo[]> => {
    return Array.from(activeStreams.values())
  },

  cleanupStream: async (infoHash: string): Promise<void> => {
    activeStreams.delete(infoHash)
    if (TorrentDaemon?.cleanupStream) {
      try {
        await TorrentDaemon.cleanupStream(infoHash)
      } catch {}
    }
  },

  // ─── Downloads (placeholder for future download support) ───────────────────
  addDownload: async (magnetURI: string): Promise<TorrentInfo> => {
    return mobileTorrentAPI.addTorrent(magnetURI)
  },

  queueDownload: async (infoHash: string) => {
    return { infoHash, queued: false }
  },

  getDownloads: async () => [],
  openDownloadFolder: async () => {},

  // ─── Shared ────────────────────────────────────────────────────────────────
  removeTorrent: async (infoHash: string): Promise<void> => {
    activeStreams.delete(infoHash)
    if (TorrentDaemon?.removeTorrent) {
      try {
        await TorrentDaemon.removeTorrent(infoHash)
      } catch {}
    }
  },

  getTorrents: async (): Promise<TorrentInfo[]> => {
    return Array.from(activeStreams.values())
  },

  getStreamURL: async (infoHash: string): Promise<string> => {
    const stream = activeStreams.get(infoHash)
    if (!stream?.streamURL) {
      throw new Error('No active stream session for this torrent')
    }
    return stream.streamURL
  },

  getMediaInfo: async (_infoHash: string): Promise<MediaInfo | null> => {
    return {
      videoCodec: 'h264',
      audioCodec: 'aac',
      audioTracks: [{ index: 0, codec: 'aac', language: 'eng', title: 'English', channels: 2, channelLayout: 'stereo', isDefault: true }],
      subtitleTracks: [],
      duration: 0,
      width: 1920,
      height: 1080,
      needsVideoTranscode: false,
      needsAudioTranscode: false,
      needsTranscode: false
    }
  },

  selectFile: async (infoHash: string, fileIndex: number): Promise<string> => {
    const stream = activeStreams.get(infoHash)
    if (stream) {
      stream.selectedFileIndex = fileIndex
    }
    return `http://127.0.0.1:8888/stream/${infoHash}?file=${fileIndex}`
  },

  notifySeek: async (infoHash: string, position: number): Promise<void> => {
    if (TorrentDaemon?.notifySeek) {
      try {
        await TorrentDaemon.notifySeek(infoHash, position)
      } catch {}
    }
  },

  updatePlaybackPosition: async (infoHash: string, currentTime: number, duration: number): Promise<void> => {
    if (TorrentDaemon?.updatePlaybackPosition) {
      try {
        await TorrentDaemon.updatePlaybackPosition(infoHash, currentTime, duration)
      } catch {}
    }
  },

  // ─── Events ────────────────────────────────────────────────────────────────
  onTorrentProgress: (callback) => {
    progressListeners.add(callback)
    return () => progressListeners.delete(callback)
  },

  onTorrentReady: (callback) => {
    readyListeners.add(callback)
    return () => readyListeners.delete(callback)
  },

  onTorrentError: (callback) => {
    errorListeners.add(callback)
    return () => errorListeners.delete(callback)
  },

  // ─── Search & Catalog (Powered by @streamforge/core) ────────────────────────
  searchTorrents: async (query: string): Promise<TorrentSearchResponse> => {
    return coreSearchMovieTorrents({ title: query })
  },

  searchEpisodeTorrents: async (request: EpisodeTorrentSearchRequest): Promise<TorrentSearchResponse> => {
    return coreSearchEpisodeTorrents(request)
  },

  searchMovieTorrents: async (request: MovieTorrentSearchRequest): Promise<TorrentSearchResponse> => {
    return coreSearchMovieTorrents(request)
  },

  searchOnlineSubtitles: async (request: OnlineSubtitleSearchRequest): Promise<OnlineSubtitleResult[]> => {
    return openSubtitlesClient.searchOnlineSubtitles(request)
  },

  downloadOnlineSubtitle: async (apiKey: string, fileId: number): Promise<string> => {
    return openSubtitlesClient.downloadOnlineSubtitle(apiKey, fileId)
  },

  searchSeries: async (query: string): Promise<SeriesSummary[]> => {
    return tvmazeClient.searchSeries(query)
  },

  getPopularSeries: async (): Promise<SeriesSummary[]> => {
    return tvmazeClient.getPopularSeries()
  },

  getSeries: async (seriesId: number): Promise<SeriesDetails> => {
    return tvmazeClient.getSeries(seriesId)
  },

  getSeasons: async (seriesId: number): Promise<SeasonSummary[]> => {
    return tvmazeClient.getSeasons(seriesId)
  },

  getSeasonEpisodes: async (seasonId: number): Promise<EpisodeSummary[]> => {
    return tvmazeClient.getSeasonEpisodes(seasonId)
  },

  getAnimeSearchMetadata: async (title: string): Promise<AnimeSearchMetadata | null> => {
    return anilistClient.getAnimeSearchMetadata(title)
  },

  searchMovies: async (query: string): Promise<MovieSummary[]> => {
    return movieCatalogClient.searchMovies(query)
  },

  getPopularMovies: async (): Promise<MovieSummary[]> => {
    return movieCatalogClient.getPopularMovies()
  },

  getMovie: async (movieId: string): Promise<MovieDetails> => {
    return movieCatalogClient.getMovie(movieId)
  },

  getCacheSize: async (): Promise<number> => 0,
  clearCache: async (): Promise<void> => {}
}
