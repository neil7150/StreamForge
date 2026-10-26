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
import { prepareMobileMagnet } from '../data/mobile-magnet'
import { isUnregisteredPreparingSession, playbackErrorMessage } from '../playback/playback-errors'
import { PlaybackSessionManager, type SessionInfo } from '../playback/session-manager'

const progressListeners = new Set<(data: TorrentProgress) => void>()
const readyListeners = new Set<(data: TorrentInfo) => void>()
const errorListeners = new Set<(data: { infoHash: string; error: string }) => void>()

// In-memory active streams for mobile
const activeStreams = new Map<string, TorrentInfo>()
const activeSessions = new Map<string, string>()
const preparingSessions = new Map<string, string>()

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
  firstVideoByteMs?: number
  bufferProgress?: number
  error?: string
  metadataReady?: boolean
  knownPeers?: number
  pendingPeers?: number
  connectingPeers?: number
  connectedSeeders?: number
  elapsedMs?: number
}

export const initializeMobileTorrentEngine = async (): Promise<string> => {
  if (!TorrentDaemon || TorrentDaemon.getProtocolVersion?.() !== 2) {
    throw new Error('Playback requires the updated StreamForge Android native module')
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
  activeSessions.clear()
  preparingSessions.clear()
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
    bufferProgress: stats.bufferProgress ?? 0,
    firstVideoByteMs: stats.firstVideoByteMs ?? 0,
    mode: 'stream',
    discovery: stats.metadataReady === undefined ? undefined : {
      metadataReady: stats.metadataReady, knownPeers: stats.knownPeers ?? 0,
      pendingPeers: stats.pendingPeers ?? 0, connectingPeers: stats.connectingPeers ?? 0,
      connectedSeeders: stats.connectedSeeders ?? 0, elapsedMs: stats.elapsedMs ?? 0
    },
    peerConnections: {
      discovered: stats.knownPeers ?? connectedPeers,
      pending: stats.pendingPeers ?? 0,
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
  const sessions = new Map([...preparingSessions, ...activeSessions])
  if (!daemon || statsPollInFlight || sessions.size === 0) return
  statsPollInFlight = true
  try {
    await Promise.all(Array.from(sessions).map(async ([infoHash, sessionId]) => {
      try {
        const rawStats = await daemon.getStats(sessionId)
        if ((activeSessions.get(infoHash) ?? preparingSessions.get(infoHash)) !== sessionId) return
        const stats = JSON.parse(rawStats) as NativeTorrentStats
        if (stats.error) throw new Error(stats.error)
        if (stats.infoHash) emitProgress(infoHash, stats)
      } catch (error) {
        // Registration races are expected; storage/engine failures must remain visible.
        if (preparingSessions.get(infoHash) === sessionId && isUnregisteredPreparingSession(error)) return
        if ((activeSessions.get(infoHash) ?? preparingSessions.get(infoHash)) !== sessionId) return
        const message = playbackErrorMessage(error)
        errorListeners.forEach(listener => listener({ infoHash, error: message }))
        void playbackSessions.close().catch(() => {})
      }
    }))
  } finally {
    statsPollInFlight = false
  }
}

function registerSession(info: SessionInfo): TorrentInfo {
  const stream: TorrentInfo = {
    ...info, mode: 'stream',
    selectedFileIndex: info.selectedFileIndex >= 0 ? info.selectedFileIndex : null,
    fileSelectionMessage: info.requiresFileSelection ? 'Choose the video file to play.' : null
  }
  activeStreams.set(info.infoHash, stream)
  activeSessions.set(info.infoHash, info.sessionId)
  if (stream.ready) readyListeners.forEach(listener => listener(stream))
  updateStatsPolling()
  return stream
}

const playbackSessions = new PlaybackSessionManager({
  start: initializeMobileTorrentEngine,
  prepare: async (id, request) => {
    if (!TorrentDaemon) throw new Error('Native torrent module is unavailable')
    const hash = extractInfoHash(request.magnetURI)!
    preparingSessions.set(hash, id)
    updateStatsPolling()
    try {
      const raw = await TorrentDaemon.prepareSession(id, request.magnetURI, request.fileIndex ?? -1, request.season ?? 0, request.episode ?? 0)
      const info = JSON.parse(raw) as SessionInfo
      if (info.sessionId !== id || !Array.isArray(info.files)) throw new Error('Invalid native session response')
      registerSession(info)
      return info
    } finally {
      if (preparingSessions.get(hash) === id) preparingSessions.delete(hash)
      updateStatsPolling()
    }
  },
  cancel: async id => {
    await TorrentDaemon?.cancelSession(id)
    for (const [hash, session] of preparingSessions) { if (session === id) preparingSessions.delete(hash) }
    for (const [hash, session] of activeSessions) {
      if (session === id) { activeSessions.delete(hash); activeStreams.delete(hash) }
    }
    updateStatsPolling()
  },
  stop: shutdownMobileTorrentEngine
})

export const beginMobilePlayback = (magnetURI: string, preferred?: PreferredEpisodeFile) => {
  if (!extractInfoHash(magnetURI)) throw new Error('Invalid magnet link: missing info hash')
  return playbackSessions.open({ magnetURI: prepareMobileMagnet(magnetURI), fileIndex: preferred?.fileIndex, season: preferred?.seasonNumber, episode: preferred?.episodeNumber })
}

export async function selectMobileFile(sessionId: string, fileIndex: number): Promise<SessionInfo> {
  if (!TorrentDaemon) throw new Error('Native torrent module is unavailable')
  const info = JSON.parse(await TorrentDaemon.selectFile(sessionId, fileIndex)) as SessionInfo
  if (activeSessions.get(info.infoHash) !== sessionId) throw new Error('Playback session was cancelled')
  if (info.sessionId !== sessionId || !info.ready || !info.streamURL) throw new Error('Invalid selected-file response')
  registerSession(info)
  return info
}

const updateStatsPolling = () => {
  const shouldPoll = progressListeners.size > 0 && (activeStreams.size > 0 || preparingSessions.size > 0)
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
    const attempt = beginMobilePlayback(magnetURI, preferredEpisode)
    const info = await attempt.result
    return activeStreams.get(info.infoHash)!
  },

  getStreams: async (): Promise<TorrentInfo[]> => {
    return Array.from(activeStreams.values())
  },

  cleanupStream: async (infoHash: string): Promise<void> => {
    if (activeStreams.has(infoHash)) await playbackSessions.close()
  },

  // ─── Downloads (placeholder for future download support) ───────────────────
  addDownload: async (magnetURI: string): Promise<TorrentInfo> => {
    throw new Error('Offline downloads are not supported on Android yet')
  },

  queueDownload: async (infoHash: string) => {
    return { infoHash, queued: false }
  },

  getDownloads: async () => [],
  openDownloadFolder: async () => {},

  // ─── Shared ────────────────────────────────────────────────────────────────
  removeTorrent: async (infoHash: string): Promise<void> => {
    await mobileTorrentAPI.cleanupStream(infoHash)
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

  getMediaInfo: async (_infoHash: string): Promise<MediaInfo | null> => null,

  selectFile: async (infoHash: string, fileIndex: number): Promise<string> => {
    const sessionId = activeSessions.get(infoHash)
    if (!sessionId) throw new Error('No active playback session')
    return (await selectMobileFile(sessionId, fileIndex)).streamURL
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

  getCacheSize: async (): Promise<number> => {
    if (!TorrentDaemon?.getCacheSize) throw new Error('Cache management requires the updated Android module')
    return TorrentDaemon.getCacheSize()
  },
  clearCache: async (): Promise<void> => {
    if (!TorrentDaemon?.clearCache) throw new Error('Cache management requires the updated Android module')
    await TorrentDaemon.clearCache()
  }
}
