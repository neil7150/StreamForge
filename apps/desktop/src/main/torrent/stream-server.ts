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
import { type ChildProcess } from 'node:child_process'
import type { TorrentManager } from './manager'
import { probeFile, createTranscodeStream, type ProbeResult } from './transcoder'

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
  '.srt': 'text/plain'
}

export class StreamServer {
  private server: http.Server | null = null
  private port: number = 0
  private torrentManager: TorrentManager

  /** Cache probe results so we don't re-probe on every request */
  private probeCache: Map<string, ProbeResult> = new Map()

  /** Active transcode processes — one per infoHash, killed on new request */
  private activeTranscodes: Map<string, ChildProcess> = new Map()

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

  async stop(): Promise<void> {
    // Kill all active transcodes
    for (const [hash, proc] of this.activeTranscodes) {
      proc.kill('SIGTERM')
      console.log(`[StreamServer] Killed transcode for ${hash}`)
    }
    this.activeTranscodes.clear()

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

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Range')
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Route: /transcode/:infoHash (force transcoded stream)
    const transcodeMatch = url.match(/^\/transcode\/([a-fA-F0-9]{40})/)
    if (transcodeMatch) {
      const infoHash = transcodeMatch[1].toLowerCase()
      this.handleTranscodedStream(req, res, infoHash)
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

  // ─── Smart Stream (auto-detect if transcoding needed) ──────────────

  /**
   * Smart stream handler — probes the file and either:
   * 1. Serves directly (if codecs are supported by Chromium)
   * 2. Transcodes on-the-fly (if codecs like H.265, AC3, etc. are detected)
   */
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

    // WebTorrent waits for missing pieces. ffprobe and ffmpeg instead see the
    // current end of a partial file as EOF, so transcoding cannot start yet.
    const fileProgress = Number((file as { progress?: number }).progress)
    if (!Number.isFinite(fileProgress) || fileProgress < 1) {
      console.log(`[StreamServer] Streaming partial file directly: ${file.name}`)
      this.handleDirectStream(req, res, infoHash)
      return
    }

    // Check if we've already probed this torrent
    let probe = this.probeCache.get(infoHash)

    if (!probe) {
      // Try to probe the file on disk
      const diskPath = this.torrentManager.getSelectedFileDiskPath(infoHash)
      if (diskPath) {
        try {
          probe = await probeFile(diskPath)
          this.probeCache.set(infoHash, probe)
        } catch (err) {
          console.warn('[StreamServer] Probe failed, serving directly:', err)
        }
      }
    }

    if (probe?.needsTranscode) {
      console.log(`[StreamServer] Transcoding required for ${infoHash} (${probe.videoCodec}/${probe.audioCodec})`)
      this.handleTranscodedStream(req, res, infoHash)
    } else {
      // Serve directly — codecs are supported
      this.handleDirectStream(req, res, infoHash)
    }
  }

  // ─── Direct Stream (Range-aware, for supported codecs) ─────────────

  private handleDirectStream(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    infoHash: string,
    fileIndex?: number
  ): void {
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
      const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1

      if (start >= fileSize || end >= fileSize || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` })
        res.end()
        return
      }

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
      // Full file
      res.writeHead(200, { 'Content-Length': fileSize })
      const stream = file.createReadStream()
      stream.on('error', (err: Error) => {
        console.error(`[StreamServer] Stream error for ${infoHash}:`, err.message)
        if (!res.headersSent) res.writeHead(500)
        res.end()
      })
      stream.pipe(res)
    }
  }

  // ─── Transcoded Stream (FFmpeg pipeline) ───────────────────────────

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
    const diskPath = this.torrentManager.getSelectedFileDiskPath(infoHash)
    if (!diskPath) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'File not found on disk' }))
      return
    }

    // Get or create probe result
    let probe = this.probeCache.get(infoHash)
    if (!probe) {
      try {
        probe = await probeFile(diskPath)
        this.probeCache.set(infoHash, probe)
      } catch {
        // Fallback: assume full transcoding needed
        probe = {
          videoCodec: 'unknown',
          audioCodec: 'unknown',
          duration: 0,
          width: 0,
          height: 0,
          needsVideoTranscode: true,
          needsAudioTranscode: true,
          needsTranscode: true
        }
      }
    }

    // Kill any existing transcode for this hash
    const existing = this.activeTranscodes.get(infoHash)
    if (existing) {
      existing.kill('SIGTERM')
      this.activeTranscodes.delete(infoHash)
    }

    // HEAD request
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'none'
      })
      res.end()
      return
    }

    console.log(`[StreamServer] Transcoding: ${diskPath}`)

    // Start ffmpeg transcode
    const ffmpegProc = createTranscodeStream(diskPath, probe)
    this.activeTranscodes.set(infoHash, ffmpegProc)

    // Set headers — transcoded stream is always MP4, no Range support
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache'
    })

    // Pipe ffmpeg output to HTTP response
    if (ffmpegProc.stdout) {
      ffmpegProc.stdout.pipe(res)
    }

    // Clean up on close
    const cleanup = () => {
      ffmpegProc.kill('SIGTERM')
      this.activeTranscodes.delete(infoHash)
    }

    res.on('close', cleanup)
    res.on('error', cleanup)

    ffmpegProc.on('close', () => {
      this.activeTranscodes.delete(infoHash)
      if (!res.writableEnded) {
        res.end()
      }
    })
  }

  // ─── Legacy: direct stream by file index (subtitles, etc.) ─────────

  private handleStreamRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    infoHash: string,
    fileIndex?: number
  ): void {
    this.handleDirectStream(req, res, infoHash, fileIndex)
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

  /**
   * Clear the probe cache for a torrent (called when torrent is removed).
   */
  clearProbeCache(infoHash: string): void {
    this.probeCache.delete(infoHash)
    const proc = this.activeTranscodes.get(infoHash)
    if (proc) {
      proc.kill('SIGTERM')
      this.activeTranscodes.delete(infoHash)
    }
  }
}
