import TorrentDaemon from '../../modules/streamforge-torrent-daemon'
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

const progressListeners = new Set<(data: TorrentProgress) => void>()
const readyListeners = new Set<(data: TorrentInfo) => void>()
const errorListeners = new Set<(data: { infoHash: string; error: string }) => void>()

// In-memory active streams for mobile
const activeStreams = new Map<string, TorrentInfo>()

const DAEMON_PORT = 8888
let daemonStartPromise: Promise<string> | null = null
let statsTimer: ReturnType<typeof setInterval> | null = null
let statsPollInFlight = false

type NativeTorrentStats = {
  infoHash?: string
  progress?: number
  downloadSpeed?: number
  uploadSpeed?: number
  peers?: number
  downloaded?: number
  totalSize?: number
  bufferProgress?: number
}

export const initializeMobileTorrentEngine = async (): Promise<string> => {
  if (!TorrentDaemon) {
    throw new Error('Torrent streaming requires the StreamForge Android development build')
  }

  if (!daemonStartPromise) {
    daemonStartPromise = TorrentDaemon.startDaemon(DAEMON_PORT).catch((error) => {
      daemonStartPromise = null
      throw error
    })
  }
  return daemonStartPromise
}

export const shutdownMobileTorrentEngine = async (): Promise<void> => {
  if (statsTimer) {
    clearInterval(statsTimer)
    statsTimer = null
  }
  activeStreams.clear()
  daemonStartPromise = null
  if (TorrentDaemon) {
    await TorrentDaemon.stopDaemon()
  }
}

const emitProgress = (infoHash: string, stats: NativeTorrentStats) => {
  const totalSize = stats.totalSize ?? 0
  const downloaded = stats.downloaded ?? 0
  const downloadSpeed = stats.downloadSpeed ?? 0
  const remainingBytes = Math.max(0, totalSize - downloaded)
  const connectedPeers = stats.peers ?? 0

  const progress: TorrentProgress = {
    infoHash,
    progress: stats.progress ?? 0,
    downloadSpeed,
    uploadSpeed: stats.uploadSpeed ?? 0,
    numPeers: connectedPeers,
    downloaded,
    uploaded: 0,
    totalSize,
    timeRemaining: downloadSpeed > 0 ? remainingBytes / downloadSpeed : 0,
    ratio: 0,
    bufferProgress: stats.bufferProgress ?? stats.progress ?? 0,
    mode: 'stream',
    peerConnections: {
      discovered: connectedPeers,
      pending: 0,
      connected: connectedPeers,
      fastTcpFallbacksArmed: 0,
      bySource: {
        tracker: 0,
        dht: 0,
        lsd: 0,
        pex: 0,
        manual: 0,
        unknown: connectedPeers
      },
      byTransport: {
        tcp: 0,
        utp: 0,
        webrtc: 0,
        webseed: 0,
        unknown: connectedPeers
      }
    }
  }

  progressListeners.forEach((listener) => listener(progress))
}

const pollTorrentStats = async () => {
  const daemon = TorrentDaemon
  if (!daemon || statsPollInFlight || activeStreams.size === 0) return
  statsPollInFlight = true
  try {
    await Promise.all(Array.from(activeStreams.keys()).map(async (infoHash) => {
      try {
        const rawStats = await daemon.getStats(infoHash)
        const stats = JSON.parse(rawStats) as NativeTorrentStats
        if (stats.infoHash) emitProgress(infoHash, stats)
      } catch {
        // A stream can disappear between the active-stream snapshot and this poll.
      }
    }))
  } finally {
    statsPollInFlight = false
  }
}

const updateStatsPolling = () => {
  const shouldPoll = progressListeners.size > 0 && activeStreams.size > 0
  if (shouldPoll && !statsTimer) {
    void pollTorrentStats()
    statsTimer = setInterval(() => void pollTorrentStats(), 1000)
  } else if (!shouldPoll && statsTimer) {
    clearInterval(statsTimer)
    statsTimer = null
  }
}

export const mobileTorrentAPI: TorrentAPI = {
  // ─── Streaming ─────────────────────────────────────────────────────────────
  addTorrent: async (magnetURI: string, preferredEpisode?: PreferredEpisodeFile): Promise<TorrentInfo> => {
    const infoHash = extractInfoHash(magnetURI)
    if (!infoHash) {
      throw new Error('Invalid magnet link: missing info hash')
    }
    try {
      await initializeMobileTorrentEngine()
      if (!TorrentDaemon) throw new Error('Torrent daemon native module is unavailable')

      const streamUrl = await TorrentDaemon.addMagnet(magnetURI, preferredEpisode?.fileIndex ?? -1)
      if (typeof streamUrl !== 'string' || !/^https?:\/\//i.test(streamUrl)) {
        throw new Error('Torrent daemon returned an invalid stream URL')
      }

      const info: TorrentInfo = {
        infoHash,
        name: 'Torrent Stream',
        files: [],
        totalSize: 0,
        streamURL: streamUrl,
        ready: true,
        mode: 'stream',
        selectedFileIndex: preferredEpisode?.fileIndex ?? null,
        requiresFileSelection: false,
        fileSelectionMessage: null
      }
      activeStreams.set(infoHash, info)
      readyListeners.forEach((listener) => listener(info))
      updateStatsPolling()
      return info
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start torrent stream'
      errorListeners.forEach((listener) => listener({ infoHash, error: message }))
      throw error
    }
  },

  getStreams: async (): Promise<TorrentInfo[]> => {
    return Array.from(activeStreams.values())
  },

  cleanupStream: async (infoHash: string): Promise<void> => {
    activeStreams.delete(infoHash)
    updateStatsPolling()
    if (TorrentDaemon) {
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
    updateStatsPolling()
    if (TorrentDaemon) {
      try {
        await TorrentDaemon.cleanupStream(infoHash)
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
    return `http://localhost:${DAEMON_PORT}/stream/${infoHash}?file=${fileIndex}`
  },

  notifySeek: async (infoHash: string, position: number): Promise<void> => {
    void infoHash
    void position
  },

  updatePlaybackPosition: async (infoHash: string, currentTime: number, duration: number): Promise<void> => {
    void infoHash
    void currentTime
    void duration
  },

  // ─── Events ────────────────────────────────────────────────────────────────
  onTorrentProgress: (callback) => {
    progressListeners.add(callback)
    updateStatsPolling()
    return () => {
      progressListeners.delete(callback)
      updateStatsPolling()
    }
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
