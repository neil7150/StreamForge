import type { MediaInfo, TorrentInfo, TorrentProgress } from '../../../preload/index.d'

export interface PlaybackBufferedRange { start: number; end: number }

export interface VideoElementDiagnostics {
  currentTime: number
  duration: number
  bufferedAhead: number
  bufferedRanges: PlaybackBufferedRange[]
  readyState: number
  networkState: number
  paused: boolean
  seeking: boolean
  buffering: boolean
  lastEvent: string
  loadRetryCount: number
  timelineOffset: number
}

export interface ConnectionDiagnostics {
  phase: string
  startedAt: number
  phaseStartedAt: number
  connectionAttempt: number
  mediaProbeAttempts: number
  streamURLAttempts: number
  playbackRequest: number
  lastSeekTarget: number | null
}

export interface PlaybackDiagnosticsInput {
  infoHash: string
  torrent?: TorrentInfo
  progress?: TorrentProgress
  mediaInfo?: MediaInfo | null
  streamURL?: string | null
  selectedFileIndex: number | null
  selectedAudioTrackIndex: number | null
  connection: ConnectionDiagnostics
  playback: VideoElementDiagnostics | null
  errors: Array<string | null | undefined>
  userAgent?: string
}

export interface PlaybackDiagnosticsReport {
  schemaVersion: 1
  generatedAt: string
  app: { name: 'StreamForge'; version: '0.1.0'; platform: string }
  connection: ConnectionDiagnostics & { elapsedMs: number; phaseElapsedMs: number }
  torrent: {
    infoHash: string; name: string | null; ready: boolean; mode: string | null
    totalSize: number; selectedFileIndex: number | null; files: number
    progress: number; bufferProgress: number; peers: number
    downloadSpeed: number; uploadSpeed: number; downloaded: number
    peerConnections: TorrentProgress['peerConnections'] | null
  }
  media: {
    videoCodec: string | null; audioCodec: string | null; resolution: string | null
    duration: number; playbackMode: 'direct' | 'compatibility' | 'unknown'
    needsVideoTranscode: boolean | null; needsAudioTranscode: boolean | null
    selectedAudioTrackIndex: number | null
    audioTracks: MediaInfo['audioTracks']; subtitleTracks: MediaInfo['subtitleTracks']
  }
  playback: (VideoElementDiagnostics & { source: string | null }) | null
  errors: string[]
}

function finite(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function safeSource(streamURL: string | null | undefined): string | null {
  if (!streamURL) return null
  return streamURL.split('?')[0] || null
}

export function buildPlaybackDiagnosticsReport(input: PlaybackDiagnosticsInput, now = Date.now()): PlaybackDiagnosticsReport {
  const { torrent, progress, mediaInfo } = input
  return {
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    app: { name: 'StreamForge', version: '0.1.0', platform: input.userAgent || 'unknown' },
    connection: {
      ...input.connection,
      elapsedMs: Math.max(0, now - input.connection.startedAt),
      phaseElapsedMs: Math.max(0, now - input.connection.phaseStartedAt)
    },
    torrent: {
      infoHash: input.infoHash,
      name: torrent?.name || null,
      ready: torrent?.ready ?? false,
      mode: torrent?.mode ?? null,
      totalSize: finite(torrent?.totalSize),
      selectedFileIndex: input.selectedFileIndex,
      files: torrent?.files.length ?? 0,
      progress: finite(progress?.progress),
      bufferProgress: finite(progress?.bufferProgress),
      peers: finite(progress?.numPeers),
      downloadSpeed: finite(progress?.downloadSpeed),
      uploadSpeed: finite(progress?.uploadSpeed),
      downloaded: finite(progress?.downloaded),
      peerConnections: progress?.peerConnections ?? null
    },
    media: {
      videoCodec: mediaInfo?.videoCodec ?? null,
      audioCodec: mediaInfo?.audioCodec ?? null,
      resolution: mediaInfo?.width && mediaInfo?.height ? `${mediaInfo.width}x${mediaInfo.height}` : null,
      duration: finite(mediaInfo?.duration),
      playbackMode: mediaInfo ? (mediaInfo.needsTranscode ? 'compatibility' : 'direct') : 'unknown',
      needsVideoTranscode: mediaInfo?.needsVideoTranscode ?? null,
      needsAudioTranscode: mediaInfo?.needsAudioTranscode ?? null,
      selectedAudioTrackIndex: input.selectedAudioTrackIndex,
      audioTracks: mediaInfo?.audioTracks ?? [],
      subtitleTracks: mediaInfo?.subtitleTracks ?? []
    },
    playback: input.playback ? { ...input.playback, source: safeSource(input.streamURL) } : null,
    errors: input.errors.filter((error): error is string => Boolean(error))
  }
}

export function serializePlaybackDiagnostics(report: PlaybackDiagnosticsReport): string {
  return JSON.stringify(report, null, 2)
}

export function playbackDiagnosticsFilename(report: PlaybackDiagnosticsReport): string {
  const stamp = report.generatedAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  return `streamforge-diagnostics-${stamp}.json`
}
