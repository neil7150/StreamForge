/**
 * StreamServer — HTTP server for streaming torrent video files.
 *
 * Serves files from WebTorrent with full HTTP Range request support.
 * For unsupported codecs (H.265, AC3, DTS, XviD, etc.), automatically
 * transcodes to H.264+AAC via FFmpeg on-the-fly.
 *
 * Routes:
 *   GET  /stream/:infoHash          — streams the selected video file
 *   GET  /stream/:infoHash/:index   — streams a specific file by index
 *   HEAD /stream/:infoHash          — probing (returns headers only)
 *   GET  /status/:infoHash          — returns JSON with torrent progress
 *   GET  /transcode/:infoHash       — force-transcoded stream (H.264+AAC)
 */

import http from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import { type ChildProcess } from 'node:child_process'
import type { TorrentManager } from './manager'
import { probeFile, createTranscodeStream, createSubtitleStream, disableHardwareVideoEncoding, warmupHardwareVideoEncoding, type ProbeResult } from './transcoder'
import {
  classifyTranscodeRequest,
  isSameTranscodeRequest,
  parseTranscodeRequestIdentity,
  type TranscodeRequestIdentity
} from './transcode-session-policy'
import {
  getRequestedAudioTrackIndex,
  requiresTimestampMediaPipeline
} from './playback-request-policy'
import { isAudioCodecSupported, selectAudioTrack } from './media-track-policy'

/** Maps file extensions to MIME types for video and subtitle content. */
const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/mp4',
  '.ts': 'video/mp2t',
  '.ogv': 'video/ogg',
  '.3gp': 'video/3gpp',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.vtt': 'text/vtt',
  '.srt': 'application/x-subrip; charset=utf-8',
  '.ass': 'text/x-ssa; charset=utf-8',
  '.ssa': 'text/x-ssa; charset=utf-8'
}

// Chromium may request MP4 metadata near the end of a file before playback.
// Keep such request-driven reads small so they unblock startup without turning
// an open-ended Range request into a full movie download.
const OUT_OF_WINDOW_RANGE_BYTES = 4 * 1024 * 1024

interface ActiveTranscode {
  process: ChildProcess
  response: http.ServerResponse
  sessionId: string
  requestId: number
}

export class StreamServer {
  private server: http.Server | null = null
  private port: number = 0
  private torrentManager: TorrentManager

  /** Cache probe results so we don't re-probe on every request */
  private probeCache: Map<string, ProbeResult> = new Map()
  private probePromises: Map<string, Promise<ProbeResult | null>> = new Map()
  private probeRetryAt: Map<string, number> = new Map()

  /** Active transcode processes — one per infoHash, killed on new request */
  private activeTranscodes: Map<string, ActiveTranscode> = new Map()  /** Short-lived embedded subtitle extraction processes grouped by stream. */
  private activeSubtitleProcesses: Map<string, Set<ChildProcess>> = new Map()

  constructor(torrentManager: TorrentManager) {
    this.torrentManager = torrentManager
  }

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res))

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address()
        if (addr && typeof addr === 'object') {
          this.port = addr.port
          const baseURL = `http://127.0.0.1:${this.port}`
          console.log(`[StreamServer] Listening at ${baseURL}`)
          void warmupHardwareVideoEncoding()
          resolve(baseURL)
        } else {
          reject(new Error('Failed to get server address'))
        }
      })

      this.server.on('error', (err) => {
        console.error('[StreamServer] Server error:', err)
        reject(err)
      })
    })
  }

  getBaseURL(): string {
    return `http://127.0.0.1:${this.port}`
  }

  getPort(): number {
    return this.port
  }

  /** Return authoritative source metadata for the renderer timeline. */
  async getMediaInfo(infoHash: string): Promise<ProbeResult | null> {
    return this.getProbe(infoHash)
  }

  async stop(): Promise<void> {
    // Kill all active transcodes
    for (const [hash, active] of this.activeTranscodes) {
      active.process.kill('SIGTERM')
      console.log(`[StreamServer] Killed transcode for ${hash}`)
    }
    this.activeTranscodes.clear()
    for (const infoHash of this.activeSubtitleProcesses.keys()) {
      this.stopSubtitleProcesses(infoHash)
    }

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[StreamServer] Stopped')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  // ─── Request routing ───────────────────────────────────────────────

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '/'

    console.log(`[StreamServer] ${req.method} ${url} (Range: ${req.headers.range || 'none'})`)


    // Internal seekable source used by FFprobe/FFmpeg.
    const sourceMatch = url.match(/^\/source\/([a-fA-F0-9]{40})/)
    if (sourceMatch) {
      const infoHash = sourceMatch[1].toLowerCase()
      const sourceURL = new URL(url, this.getBaseURL())
      const playbackRequest = sourceURL.searchParams.get('consumer') === 'transcode'
        ? parseTranscodeRequestIdentity(url, this.getBaseURL())
        : null
      this.handleSourceStream(req, res, infoHash, playbackRequest)
      return
    }

    // Route: /transcode/:infoHash (force transcoded stream)
    const transcodeMatch = url.match(/^\/transcode\/([a-fA-F0-9]{40})/)
    if (transcodeMatch) {
      const infoHash = transcodeMatch[1].toLowerCase()
      this.handleTranscodedStream(req, res, infoHash)
      return
    }

    // Route: /stream/:infoHash/subtitle/:streamIndex
    const subtitleMatch = url.match(/^\/stream\/([a-fA-F0-9]{40})\/subtitle\/(\d+)(?:\?|$)/)
    if (subtitleMatch) {
      const infoHash = subtitleMatch[1].toLowerCase()
      const streamIndex = Number.parseInt(subtitleMatch[2], 10)
      void this.handleEmbeddedSubtitle(req, res, infoHash, streamIndex)
      return
    }

    // Route: /stream/:infoHash/:fileIndex
    const streamFileMatch = url.match(/^\/stream\/([a-fA-F0-9]{40})\/(\d+)/)
    if (streamFileMatch) {
      const infoHash = streamFileMatch[1].toLowerCase()
      const fileIndex = parseInt(streamFileMatch[2], 10)
      this.handleStreamRequest(req, res, infoHash, fileIndex)
      return
    }

    // Route: /stream/:infoHash
    const streamMatch = url.match(/^\/stream\/([a-fA-F0-9]{40})/)
    if (streamMatch) {
      const infoHash = streamMatch[1].toLowerCase()
      this.handleSmartStream(req, res, infoHash)
      return
    }

    // Route: /status/:infoHash
    const statusMatch = url.match(/^\/status\/([a-fA-F0-9]{40})/)
    if (statusMatch) {
      const infoHash = statusMatch[1].toLowerCase()
      this.handleStatusRequest(res, infoHash)
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  }

  // Internal rolling source

  private handleSourceStream(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    infoHash: string,
    playbackRequest: TranscodeRequestIdentity | null
  ): void {
    const file = this.torrentManager.getSelectedFile(infoHash)
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Torrent or file not found' }))
      return
    }

    const fileSize = file.length
    const ext = path.extname(file.name).toLowerCase()
    let start = 0
    let end = fileSize - 1
    let statusCode = 200

    if (req.headers.range) {
      const match = req.headers.range.match(/^bytes=(\d*)-(\d*)$/)
      if (!match || (!match[1] && !match[2])) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` })
        res.end()
        return
      }

      if (match[1]) {
        start = Number.parseInt(match[1], 10)
        end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1
      } else {
        const suffixLength = Number.parseInt(match[2], 10)
        start = Math.max(0, fileSize - suffixLength)
      }

      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= fileSize || end < start) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` })
        res.end()
        return
      }
      end = Math.min(end, fileSize - 1)
      statusCode = 206
    }

    const headers: Record<string, string | number> = {
      'Accept-Ranges': 'bytes',
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': end - start + 1,
      'Cache-Control': 'no-store'
    }
    if (statusCode === 206) {
      headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`
    }

    res.writeHead(statusCode, headers)
    if (req.method === 'HEAD') {
      res.end()
      return
    }

    const source = Readable.from(this.iterateSourceSegments(infoHash, file, start, end, playbackRequest))
    source.on('error', (error: Error) => {
      console.error(`[StreamServer] Rolling source error for ${infoHash}:`, error.message)
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
    res.on('close', () => {
      if (!source.destroyed) source.destroy()
    })
    source.pipe(res)
  }

  private async *iterateSourceSegments(
    infoHash: string,
    file: NonNullable<ReturnType<TorrentManager['getSelectedFile']>>,
    start: number,
    end: number,
    playbackRequest: TranscodeRequestIdentity | null
  ): AsyncGenerator<Buffer> {
    let cursor = start

    while (cursor <= end) {
      const segmentEnd = Math.min(end, cursor + OUT_OF_WINDOW_RANGE_BYTES - 1)
      const segment = file.createReadStream({ start: cursor, end: segmentEnd })
      try {
        for await (const chunk of segment) {
          yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        }
      } finally {
        segment.destroy()
      }

      cursor = segmentEnd + 1
      if (
        playbackRequest
        && isSameTranscodeRequest(this.activeTranscodes.get(infoHash) ?? null, playbackRequest)
      ) {
        const duration = this.probeCache.get(infoHash)?.duration ?? 0
        this.torrentManager.updateStreamBytePosition(infoHash, cursor, duration)
      }
    }
  }

  private getProbe(infoHash: string): Promise<ProbeResult | null> {
    const cached = this.probeCache.get(infoHash)
    const retryAt = this.probeRetryAt.get(infoHash)
    if (cached && (retryAt === undefined || Date.now() < retryAt)) return Promise.resolve(cached)
    if (cached) {
      this.probeCache.delete(infoHash)
      this.probeRetryAt.delete(infoHash)
    }

    const existing = this.probePromises.get(infoHash)
    if (existing) return existing

    const diskPath = this.torrentManager.getSelectedFileDiskPath(infoHash)
    const input = diskPath || `${this.getBaseURL()}/source/${infoHash}?consumer=probe`
    const probeStartedAt = Date.now()
    this.torrentManager.prioritizeStreamMetadata(infoHash)
    const pending = probeFile(input)
      .then((probe) => {
        this.probeCache.set(infoHash, probe)
        this.torrentManager.configureStreamMedia(infoHash, probe.duration)
        console.log(`[StreamServer] Media probe ready in ${Date.now() - probeStartedAt}ms for ${infoHash}`)
        if (probe.duration > 0) this.probeRetryAt.delete(infoHash)
        else this.probeRetryAt.set(infoHash, Date.now() + 5_000)
        return probe
      })
      .catch((error) => {
        console.warn(`[StreamServer] Probe failed for ${infoHash}; using safe transcode fallback:`, error)
        const fallback: ProbeResult = {
          videoCodec: 'unknown',
          audioCodec: 'unknown',
          audioTracks: [],
          subtitleTracks: [],
          duration: 0,
          width: 0,
          height: 0,
          needsVideoTranscode: true,
          needsAudioTranscode: true,
          needsTranscode: true
        }
        this.probeCache.set(infoHash, fallback)
        this.probeRetryAt.set(infoHash, Date.now() + 5_000)
        return fallback
      })
      .finally(() => {
        this.torrentManager.releaseStreamMetadata(infoHash)
        this.probePromises.delete(infoHash)
      })

    this.probePromises.set(infoHash, pending)
    return pending
  }

  // Smart Stream (auto-detect if transcoding needed)

  /** Probe the torrent source and transcode only unsupported tracks. */
  private async handleSmartStream(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    infoHash: string
  ): Promise<void> {
    const file = this.torrentManager.getSelectedFile(infoHash)
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Torrent or file not found' }))
      return
    }

    const probe = await this.getProbe(infoHash)
    if (req.destroyed) return

    // Chromium's direct byte-range seeking is unreliable through a custom
    // protocol for some otherwise compatible MP4/MKV files. Timeline seeks
    // therefore use FFmpeg as a timestamp-aware remuxer. Compatible H.264/AAC
    // tracks are stream-copied, so this does not incur video transcoding.
    if (requiresTimestampMediaPipeline(req.url || '/', this.getBaseURL())) {
      console.log(`[StreamServer] Timestamp/track remux for ${file.name}`)
      void this.handleTranscodedStream(req, res, infoHash)
      return
    }

    if (probe?.needsTranscode) {
      console.log(`[StreamServer] Transcoding required for ${infoHash} (${probe.videoCodec}/${probe.audioCodec})`)
      void this.handleTranscodedStream(req, res, infoHash)
    } else {
      console.log(`[StreamServer] Direct stream for ${file.name} (${probe?.videoCodec || 'unknown'}/${probe?.audioCodec || 'unknown'})`)
      void this.handleDirectStream(req, res, infoHash)
    }
  }
  // ─── Direct Stream (Range-aware, for supported codecs) ─────────────

  private async handleDirectStream(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    infoHash: string,
    fileIndex?: number
  ): Promise<void> {
    const file = fileIndex !== undefined
      ? this.torrentManager.getFileByIndex(infoHash, fileIndex)
      : this.torrentManager.getSelectedFile(infoHash)

    if (!file) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Torrent or file not found' }))
      return
    }

    const fileSize = file.length
    const ext = path.extname(file.name).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'

    console.log(`[StreamServer] Direct: ${file.name} (${fileSize} bytes, ${contentType})`)

    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', contentType)

    // HEAD request
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Length': fileSize })
      res.end()
      return
    }

    // Range request
    const rangeHeader = req.headers.range
    if (rangeHeader) {
      const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (!rangeMatch) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` })
        res.end()
        return
      }

      const start = parseInt(rangeMatch[1], 10)
      const requestedEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1
      if (start >= fileSize || requestedEnd < start) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + fileSize })
        res.end()
        return
      }

      // A video element often asks for the complete remainder of the file.
      // Cap normal reads to the rolling playhead window. MP4 files may first
      // ask for metadata near the end, so permit a small bounded range there;
      // file.createReadStream then prioritizes exactly those missing pieces.
      const streamWindow = fileIndex === undefined
        ? this.torrentManager.getStreamWindow(infoHash)
        : null
      const startInsideWindow = !!streamWindow
        && start >= streamWindow.start
        && start <= streamWindow.end
      const readableEnd = startInsideWindow
        ? streamWindow!.end
        : streamWindow
          ? Math.min(fileSize - 1, start + OUT_OF_WINDOW_RANGE_BYTES - 1)
          : fileSize - 1
      const end = Math.min(requestedEnd, readableEnd, fileSize - 1)

      const chunkSize = end - start + 1
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunkSize
      })

      const stream = file.createReadStream({ start, end })
      stream.on('error', (err: Error) => {
        console.error(`[StreamServer] Stream error for ${infoHash}:`, err.message)
        if (!res.headersSent) res.writeHead(500)
        res.end()
      })
      stream.pipe(res)
    } else {
      const streamWindow = fileIndex === undefined
        ? this.torrentManager.getStreamWindow(infoHash)
        : null
      // Use a bounded response even for clients that omit Range headers.
      const end = streamWindow?.end ?? Math.min(fileSize - 1, 12 * 1024 * 1024)
      const chunkSize = end + 1
      res.writeHead(206, {
        'Content-Range': `bytes 0-${end}/${fileSize}`,
        'Content-Length': chunkSize
      })
      const stream = file.createReadStream({ start: 0, end })
      stream.on('error', (err: Error) => {
        console.error(`[StreamServer] Stream error for ${infoHash}:`, err.message)
        if (!res.headersSent) res.writeHead(500)
        res.end()
      })
      stream.pipe(res)
    }
  }

  // ─── Transcoded Stream (FFmpeg pipeline) ───────────────────────────


  /** Convert one short embedded text-subtitle window to WebVTT. */
  private async handleEmbeddedSubtitle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    infoHash: string,
    streamIndex: number
  ): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' })
      res.end()
      return
    }

    const file = this.torrentManager.getSelectedFile(infoHash)
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Torrent or file not found' }))
      return
    }

    const probe = await this.getProbe(infoHash)
    if (req.destroyed) return
    const track = probe?.subtitleTracks.find((candidate) => candidate.index === streamIndex)
    if (!track) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Subtitle track not found' }))
      return
    }
    if (!track.textBased) {
      res.writeHead(415, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        error: `${track.codec} is an image-based subtitle track and cannot be displayed as text`
      }))
      return
    }

    const requestURL = new URL(req.url || '/', this.getBaseURL())
    const rawStart = Number.parseFloat(requestURL.searchParams.get('start') || '0')
    const rawDuration = Number.parseFloat(requestURL.searchParams.get('duration') || '30')
    const maxStart = probe?.duration && probe.duration > 0 ? probe.duration : Number.MAX_SAFE_INTEGER
    const startSeconds = Number.isFinite(rawStart) ? Math.max(0, Math.min(rawStart, maxStart)) : 0
    const durationSeconds = Number.isFinite(rawDuration) ? Math.max(1, Math.min(rawDuration, 30)) : 30

    const headers = {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Subtitle-Window-Start': startSeconds.toFixed(3),
      'X-Subtitle-Window-Duration': durationSeconds.toFixed(3)
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, headers)
      res.end()
      return
    }

    const diskPath = this.torrentManager.getSelectedFileDiskPath(infoHash)
    const input = diskPath || `${this.getBaseURL()}/source/${infoHash}?consumer=subtitle`
    const subtitleProcess = createSubtitleStream(input, streamIndex, startSeconds, durationSeconds)
    const subtitleProcesses = this.activeSubtitleProcesses.get(infoHash) ?? new Set<ChildProcess>()
    subtitleProcesses.add(subtitleProcess)
    this.activeSubtitleProcesses.set(infoHash, subtitleProcesses)
    let headersSent = false
    let stderr = ''
    let completed = false

    const timeout = setTimeout(() => {
      if (completed) return
      subtitleProcess.kill('SIGTERM')
      if (!headersSent && !res.writableEnded) {
        res.writeHead(504, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Subtitle window timed out while waiting for torrent data' }))
      } else if (!res.writableEnded) {
        res.end()
      }
    }, 20_000)

    const cleanup = () => {
      clearTimeout(timeout)
      if (!completed && !subtitleProcess.killed) subtitleProcess.kill('SIGTERM')
    }
    req.once('aborted', cleanup)
    res.once('close', cleanup)

    subtitleProcess.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 4_096) stderr += chunk.toString()
    })
    subtitleProcess.stdout?.on('data', (chunk: Buffer) => {
      if (!headersSent) {
        headersSent = true
        res.writeHead(200, headers)
      }
      if (!res.writableEnded) res.write(chunk)
    })
    subtitleProcess.once('error', (error) => {
      completed = true
      clearTimeout(timeout)
      this.untrackSubtitleProcess(infoHash, subtitleProcess)
      console.error(`[StreamServer] Subtitle extraction failed for ${infoHash}:`, error.message)
      if (!headersSent && !res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to start subtitle extraction' }))
      } else if (!res.writableEnded) {
        res.end()
      }
    })
    subtitleProcess.once('close', (code) => {
      completed = true
      clearTimeout(timeout)
      this.untrackSubtitleProcess(infoHash, subtitleProcess)
      if (code !== 0 && code !== null) {
        console.warn(`[StreamServer] Subtitle extraction exited with code ${code}: ${stderr.trim()}`)
      }
      if (!headersSent && !res.writableEnded) {
        if (code === 0) {
          res.writeHead(200, headers)
          res.end('WEBVTT\n\n')
        } else {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Could not convert this subtitle window' }))
        }
      } else if (!res.writableEnded) {
        res.end()
      }
    })
  }
  /**
   * Serves a transcoded stream via FFmpeg.
   * Converts any unsupported codec to H.264+AAC fragmented MP4.
   * No Range support — the video element buffers from the start.
   */
  private async handleTranscodedStream(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    infoHash: string
  ): Promise<void> {
    const file = this.torrentManager.getSelectedFile(infoHash)
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Torrent or file not found' }))
      return
    }

    // A browser HEAD probe must never replace an active playback process.
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'none',
        'Cache-Control': 'no-store'
      })
      res.end()
      return
    }

    let probe = await this.getProbe(infoHash)
    if (req.destroyed) return
    if (!probe) {
      probe = {
        videoCodec: 'unknown',
        audioCodec: 'unknown',
        audioTracks: [],
        subtitleTracks: [],
        duration: 0,
        width: 0,
        height: 0,
        needsVideoTranscode: true,
        needsAudioTranscode: true,
        needsTranscode: true
      }
    }

    const requestURL = new URL(req.url || '/', this.getBaseURL())
    const requestedStart = Number.parseFloat(requestURL.searchParams.get('start') || '0')
    const requestedAudioTrackIndex = getRequestedAudioTrackIndex(req.url || '/', this.getBaseURL())
    const selectedAudioTrack = selectAudioTrack(probe.audioTracks, requestedAudioTrackIndex ?? undefined)
    const selectedAudioCodec = selectedAudioTrack?.codec ?? probe.audioCodec
    const selectedAudioNeedsTranscode = selectedAudioCodec ? !isAudioCodecSupported(selectedAudioCodec) : false
    const { sessionId, requestId } = parseTranscodeRequestIdentity(req.url || '/', this.getBaseURL())
    const maxStart = probe.duration > 0 ? Math.max(0, probe.duration - 0.25) : Number.MAX_SAFE_INTEGER
    const seekSeconds = Number.isFinite(requestedStart)
      ? Math.max(0, Math.min(requestedStart, maxStart))
      : 0

    const diskPath = this.torrentManager.getSelectedFileDiskPath(infoHash)
    const sourceParams = new URLSearchParams({
      consumer: 'transcode',
      session: sessionId,
      request: String(requestId)
    })
    const input = diskPath || `${this.getBaseURL()}/source/${infoHash}?${sourceParams.toString()}`
    const realtimeInput = !diskPath

    const existing = this.activeTranscodes.get(infoHash)
    const requestDecision = classifyTranscodeRequest(existing ?? null, { sessionId, requestId })
    if (requestDecision === 'duplicate' || requestDecision === 'stale') {
      res.writeHead(409, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Retry-After': '1'
      })
      res.end(JSON.stringify({
        error: requestDecision === 'duplicate'
          ? 'Playback request is already active'
          : 'Stale playback request'
      }))
      return
    }

    if (existing) {
      existing.process.kill('SIGTERM')
      if (!existing.response.writableEnded) existing.response.end()
      this.activeTranscodes.delete(infoHash)
    }

    console.log(
      `[StreamServer] Transcoding ${file.name}: `
      + `video=${probe.needsVideoTranscode ? `${probe.videoCodec}->h264` : `${probe.videoCodec} copy`} `
      + `audio=${selectedAudioNeedsTranscode ? `${selectedAudioCodec}->aac` : `${selectedAudioCodec} copy`} `
      + `track=${selectedAudioTrack?.index ?? 'default'} start=${seekSeconds.toFixed(3)}s`
    )

    const ffmpegProc = createTranscodeStream(input, probe, seekSeconds, realtimeInput, selectedAudioTrack?.index)
    const active: ActiveTranscode = { process: ffmpegProc, response: res, sessionId, requestId }
    this.activeTranscodes.set(infoHash, active)

    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'none',
      'Content-Duration': probe.duration > 0 ? probe.duration.toFixed(3) : '0',
      'X-Content-Duration': probe.duration > 0 ? probe.duration.toFixed(3) : '0'
    })

    if (ffmpegProc.stdout) {
      ffmpegProc.stdout.pipe(res)
    }

    const cleanup = () => {
      if (!ffmpegProc.killed) ffmpegProc.kill('SIGTERM')
      if (this.activeTranscodes.get(infoHash) === active) {
        this.activeTranscodes.delete(infoHash)
      }
    }

    res.once('close', cleanup)
    res.once('error', cleanup)
    ffmpegProc.once('error', (error) => {
      console.error(`[StreamServer] FFmpeg failed for ${infoHash}:`, error.message)
      cleanup()
      if (!res.writableEnded) res.end()
    })
    ffmpegProc.once('close', (code) => {
      if (code !== 0 && code !== null && !ffmpegProc.killed) {
        disableHardwareVideoEncoding()
      }
      if (this.activeTranscodes.get(infoHash) === active) {
        this.activeTranscodes.delete(infoHash)
      }
      if (!res.writableEnded) res.end()
    })
  }
  // ─── Legacy: direct stream by file index (subtitles, etc.) ─────────

  private handleStreamRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    infoHash: string,
    fileIndex?: number
  ): void {
    void this.handleDirectStream(req, res, infoHash, fileIndex)
  }

  // ─── Status handler ────────────────────────────────────────────────

  private handleStatusRequest(res: http.ServerResponse, infoHash: string): void {
    const info = this.torrentManager.getTorrentProgress(infoHash)
    if (!info) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Torrent not found' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(info))
  }

  private untrackSubtitleProcess(infoHash: string, process: ChildProcess): void {
    const processes = this.activeSubtitleProcesses.get(infoHash)
    if (!processes) return
    processes.delete(process)
    if (processes.size === 0) this.activeSubtitleProcesses.delete(infoHash)
  }

  private stopSubtitleProcesses(infoHash: string): void {
    const processes = this.activeSubtitleProcesses.get(infoHash)
    if (!processes) return
    this.activeSubtitleProcesses.delete(infoHash)
    for (const process of processes) {
      if (!process.killed) process.kill('SIGTERM')
    }
  }

  /**
   * Clear the probe cache for a torrent (called when torrent is removed).
   */
  clearProbeCache(infoHash: string): void {
    this.stopSubtitleProcesses(infoHash)
    this.torrentManager.releaseStreamMetadata(infoHash)
    this.probeCache.delete(infoHash)
    this.probePromises.delete(infoHash)
    this.probeRetryAt.delete(infoHash)
    const active = this.activeTranscodes.get(infoHash)
    if (active) {
      active.process.kill('SIGTERM')
      this.activeTranscodes.delete(infoHash)
    }
  }
}
