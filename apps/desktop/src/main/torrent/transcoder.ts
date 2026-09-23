/**
 * Transcoder — FFmpeg-based codec detection and on-the-fly transcoding.
 *
 * Torrent files often use codecs unsupported by Chromium's <video> element:
 *   ❌ H.265/HEVC, XviD/DivX, MPEG-2 video
 *   ❌ AC3 (Dolby Digital), DTS, EAC3 audio
 *
 * This module:
 *   1. Probes files with ffprobe to detect codecs
 *   2. Decides whether transcoding is needed
 *   3. Spawns ffmpeg to transcode to H.264+AAC on-the-fly if needed
 *   4. Produces fragmented MP4 output that can be piped to an HTTP response
 */

import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import {
  isAudioCodecSupported,
  isTextSubtitleCodec,
  selectAudioTrack,
  type MediaAudioTrack,
  type MediaSubtitleTrack
} from './media-track-policy'

// ─── Binary paths ────────────────────────────────────────────────────
// ffmpeg-static and @ffprobe-installer/ffprobe provide bundled binaries.
// In production (asar), binaries must be unpacked.

let ffmpegPath: string
let ffprobePath: string

function fixAsarPath(p: string): string {
  return p && p.includes('app.asar')
    ? p.replace('app.asar', 'app.asar.unpacked')
    : p
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ffmpegPath = fixAsarPath(require('ffmpeg-static'))
} catch {
  ffmpegPath = 'ffmpeg'
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ffprobePath = fixAsarPath(require('@ffprobe-installer/ffprobe').path)
} catch {
  ffprobePath = 'ffprobe'
}

type HardwareVideoEncoder = 'nvenc' | 'qsv' | 'amf'

let cachedHardwareVideoEncoder: HardwareVideoEncoder | null | undefined
let hardwareDetectionStarted = false
let hardwareDetectionGeneration = 0

function hardwareEncoderArgs(encoder: HardwareVideoEncoder): string[] {
  if (encoder === 'nvenc') {
    return [
      '-c:v', 'h264_nvenc',
      '-preset', 'p1',
      '-tune', 'll',
      '-rc', 'vbr',
      '-cq', '23',
      '-b:v', '0',
      '-zerolatency', '1',
      '-bf', '0'
    ]
  }
  if (encoder === 'qsv') {
    return [
      '-c:v', 'h264_qsv',
      '-preset', 'veryfast',
      '-global_quality', '23',
      '-look_ahead', '0',
      '-bf', '0'
    ]
  }
  return [
    '-c:v', 'h264_amf',
    '-usage', 'transcoding',
    '-quality', 'speed',
    '-rc', 'cqp',
    '-qp_i', '23',
    '-qp_p', '23',
    '-bf', '0'
  ]
}

export function disableHardwareVideoEncoding(): void {
  if (cachedHardwareVideoEncoder) {
    console.warn(`[Transcoder] Disabling ${cachedHardwareVideoEncoder} after a runtime failure; next attempt will use CPU`)
  }
  hardwareDetectionGeneration++
  hardwareDetectionStarted = false
  cachedHardwareVideoEncoder = null
}

function testHardwareVideoEncoder(candidate: HardwareVideoEncoder): Promise<boolean> {
  return new Promise((resolve) => {
    const process = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=size=320x180:rate=30',
      '-frames:v', '1',
      ...hardwareEncoderArgs(candidate),
      '-f', 'null', '-'
    ], { windowsHide: true, stdio: 'ignore' })
    let settled = false
    const finish = (available: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(available)
    }
    const timeout = setTimeout(() => {
      process.kill('SIGTERM')
      finish(false)
    }, 2_500)
    process.once('error', () => finish(false))
    process.once('close', (code) => finish(code === 0))
  })
}

/** Detect hardware support in the background so first playback never blocks on probes. */
export async function warmupHardwareVideoEncoding(): Promise<void> {
  if (cachedHardwareVideoEncoder !== undefined || hardwareDetectionStarted) return
  hardwareDetectionStarted = true
  const generation = ++hardwareDetectionGeneration
  cachedHardwareVideoEncoder = null

  for (const candidate of ['nvenc', 'qsv', 'amf'] as HardwareVideoEncoder[]) {
    const available = await testHardwareVideoEncoder(candidate)
    if (generation !== hardwareDetectionGeneration) return
    if (available) {
      cachedHardwareVideoEncoder = candidate
      hardwareDetectionStarted = false
      console.log(`[Transcoder] Hardware H.264 encoder: ${candidate}`)
      return
    }
  }

  if (generation === hardwareDetectionGeneration) {
    hardwareDetectionStarted = false
    console.log('[Transcoder] No working hardware H.264 encoder; using libx264')
  }
}

function detectHardwareVideoEncoder(): HardwareVideoEncoder | null {
  if (cachedHardwareVideoEncoder === undefined) void warmupHardwareVideoEncoding()
  return cachedHardwareVideoEncoder ?? null
}
/** Video codecs Chromium can play natively */
const SUPPORTED_VIDEO_CODECS = new Set([
  'h264', 'avc', 'avc1',
  'vp8', 'vp9',
  'av1',
  'theora'
])


// ─── Types ───────────────────────────────────────────────────────────

export interface ProbeResult {
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

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Probe a video file to detect its codecs and whether transcoding is needed.
 * Uses ffprobe from @ffprobe-installer/ffprobe.
 */
export async function probeFile(input: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-probesize', '4194304',
      '-analyzeduration', '2000000',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      '-show_chapters',
      input
    ]

    const proc = spawn(ffprobePath, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill('SIGTERM')
      reject(new Error('Codec detection timed out after 8 seconds'))
    }, 8_000)

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)

      if (code !== 0) {
        console.warn(`[Transcoder] ffprobe exited with code ${code}: ${stderr}`)
        resolve({
          videoCodec: null,
          audioCodec: null,
          audioTracks: [],
          subtitleTracks: [],
          duration: 0,
          width: 0,
          height: 0,
          needsVideoTranscode: true,
          needsAudioTranscode: true,
          needsTranscode: true
        })
        return
      }

      try {
        const data = JSON.parse(stdout)
        const streams = data.streams || []
        const format = data.format || {}
        const chapters: MediaChapter[] = Array.isArray(data.chapters)
          ? data.chapters.flatMap((chapter: Record<string, unknown>) => {
            const start = Number(chapter.start_time)
            const end = Number(chapter.end_time)
            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
            const tags = chapter.tags && typeof chapter.tags === 'object'
              ? chapter.tags as Record<string, unknown>
              : {}
            return [{ start, end, title: typeof tags.title === 'string' ? tags.title : null }]
          })
          : []

        let videoCodec: string | null = null
        let width = 0
        let height = 0
        const audioTracks: MediaAudioTrack[] = []
        const subtitleTracks: MediaSubtitleTrack[] = []

        for (const stream of streams) {
          if (stream.codec_type === 'video' && !videoCodec) {
            videoCodec = (stream.codec_name || '').toLowerCase()
            width = stream.width || 0
            height = stream.height || 0
          }
          if (stream.codec_type === 'audio') {
            audioTracks.push({
              index: Number(stream.index),
              codec: (stream.codec_name || 'unknown').toLowerCase(),
              language: String(stream.tags?.language || 'und').toLowerCase(),
              title: stream.tags?.title ? String(stream.tags.title) : null,
              channels: Number(stream.channels) || 0,
              channelLayout: stream.channel_layout ? String(stream.channel_layout) : null,
              isDefault: Number(stream.disposition?.default) === 1
            })
          }
          if (stream.codec_type === 'subtitle') {
            const codec = (stream.codec_name || 'unknown').toLowerCase()
            subtitleTracks.push({
              index: Number(stream.index),
              codec,
              language: String(stream.tags?.language || 'und').toLowerCase(),
              title: stream.tags?.title ? String(stream.tags.title) : null,
              isDefault: Number(stream.disposition?.default) === 1,
              textBased: isTextSubtitleCodec(codec)
            })
          }
        }

        const defaultAudioTrack = selectAudioTrack(audioTracks)
        const audioCodec = defaultAudioTrack?.codec ?? null
        const needsVideoTranscode = videoCodec
          ? !SUPPORTED_VIDEO_CODECS.has(videoCodec)
          : false
        const needsAudioTranscode = audioCodec
          ? !isAudioCodecSupported(audioCodec)
          : false

        const result: ProbeResult = {
          videoCodec,
          audioCodec,
          audioTracks,
          subtitleTracks,
          duration: parseFloat(format.duration) || 0,
          width,
          height,
          needsVideoTranscode,
          needsAudioTranscode,
          needsTranscode: needsVideoTranscode || needsAudioTranscode,
          chapters
        }

        console.log(
          `[Transcoder] Probed: video=${videoCodec} audio=${audioCodec} ` +
          `${result.width}x${result.height} ${result.duration.toFixed(1)}s ` +
          `transcode=${result.needsTranscode ? 'YES' : 'no'} ` +
          `(video=${needsVideoTranscode ? 'YES' : 'no'} audio=${needsAudioTranscode ? 'YES' : 'no'})`
        )

        resolve(result)
      } catch (error) {
        reject(new Error(`Failed to parse codec information: ${(error as Error).message}`))
      }
    })

    proc.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
  })
}
/**
 * Quick codec check based on file extension.
 * Used when ffprobe isn't available or as a fast pre-check.
 * Returns true if the container format commonly contains unsupported codecs.
 */
export function mightNeedTranscoding(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase()
  // These formats commonly contain H.265, AC3, DTS
  const suspectFormats = new Set(['.mkv', '.avi', '.wmv', '.flv', '.ts', '.mpg', '.mpeg', '.m2ts'])
  return suspectFormats.has(ext)
}

/**
 * Spawn an ffmpeg process that transcodes a video file to fragmented MP4
 * (H.264 + AAC) and streams the output via stdout.
 *
 * @param input - Disk path or local torrent-backed HTTP source
 * @param probe - Probe result to decide what to transcode
 * @param seekSeconds - Optional: start from this time position (for seeking)
 * @param realtimeInput - Pace torrent reads close to playback speed
 * @returns The spawned ChildProcess — pipe `proc.stdout` to your HTTP response
 */
export function createTranscodeStream(
  input: string,
  probe: ProbeResult,
  seekSeconds: number = 0,
  realtimeInput: boolean = false,
  audioStreamIndex?: number
): ChildProcess {
  const args: string[] = []
  const selectedAudioTrack = selectAudioTrack(probe.audioTracks, audioStreamIndex)
  const selectedAudioCodec = selectedAudioTrack?.codec ?? probe.audioCodec
  const needsAudioTranscode = selectedAudioCodec ? !isAudioCodecSupported(selectedAudioCodec) : false
  const hardwareEncoder = probe.needsVideoTranscode ? detectHardwareVideoEncoder() : null

  if (hardwareEncoder === 'nvenc' && ['hevc', 'h265', 'mpeg2video'].includes(probe.videoCodec || '')) {
    args.push('-hwaccel', 'cuda')
  } else if (hardwareEncoder) {
    args.push('-hwaccel', 'auto')
  }

  if (realtimeInput) {
    // Build enough browser-side media buffer for instant 10-second skips, then
    // return to native playback rate so transcoding does not outrun playback.
    args.push('-readrate', '1', '-readrate_initial_burst', '15')
  }

  // Seek close to the target at input level, then trim a short preroll after
  // opening the input. This stays fast for torrents and starts copied H.264
  // on a valid nearby keyframe without retaining the preroll timestamps.
  const seekPreroll = seekSeconds > 0 ? Math.min(5, seekSeconds) : 0
  const inputSeek = Math.max(0, seekSeconds - seekPreroll)
  if (inputSeek > 0) {
    args.push('-ss', inputSeek.toFixed(3))
  }

  args.push('-i', input)

  if (seekPreroll > 0) {
    args.push('-ss', seekPreroll.toFixed(3))
  }

  // Video codec
  if (probe.needsVideoTranscode) {
    if (probe.width > 1920 || probe.height > 1080) {
      args.push(
        '-vf',
        'scale=w=1920:h=1080:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p'
      )
    }

    if (hardwareEncoder) {
      args.push(...hardwareEncoderArgs(hardwareEncoder), '-pix_fmt', 'yuv420p')
      console.log(`[Transcoder] Video: ${probe.videoCodec} → H.264 (${hardwareEncoder} hardware)`)
    } else {
      args.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-crf', '23',
        '-pix_fmt', 'yuv420p'
      )
      console.log(`[Transcoder] Video: ${probe.videoCodec} → H.264 (libx264 CPU)`)
    }
  } else {
    // Copy video stream (no re-encoding, very fast)
    args.push('-c:v', 'copy')
    console.log(`[Transcoder] Video: ${probe.videoCodec} → copy (passthrough)`)
  }

  // Audio codec
  if (needsAudioTranscode) {
    // Transcode to AAC
    args.push(
      '-c:a', 'aac',
      '-b:a', '192k',   // Good audio quality
      '-ac', '2'         // Stereo (prevents issues with 5.1/7.1 AC3/DTS)
    )
    console.log(`[Transcoder] Audio: ${selectedAudioCodec} → AAC (transcoding)`)
  } else {
    // Copy audio stream
    args.push('-c:a', 'copy')
    console.log(`[Transcoder] Audio: ${selectedAudioCodec} → copy (passthrough)`)
  }

  // Give the muxer the remaining source duration even though stdout is non-seekable.
  if (probe.duration > 0 && Number.isFinite(probe.duration)) {
    const remainingDuration = Math.max(0.001, probe.duration - seekSeconds)
    args.push('-t', remainingDuration.toFixed(3))
  }

  // Emit short fragmented-MP4 chunks instead of waiting for the next source
  // keyframe, which can otherwise add 5-10 seconds of startup latency.
  args.push(
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-frag_duration', '1000000',
    '-min_frag_duration', '500000',
    '-flush_packets', '1',
    '-map', '0:v:0',
    '-map', selectedAudioTrack ? `0:${selectedAudioTrack.index}?` : '0:a:0?',
    '-y',              // Overwrite output
    'pipe:1'           // Output to stdout
  )

  console.log(`[Transcoder] Starting: ffmpeg ${args.join(' ')}`)

  const proc = spawn(ffmpegPath, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'] // stdin=ignore, stdout=pipe, stderr=pipe
  })

  // Log ffmpeg stderr (progress/errors) at reduced verbosity
  let lastLog = 0
  proc.stderr?.on('data', (data: Buffer) => {
    const now = Date.now()
    // Throttle logging to once every 5 seconds
    if (now - lastLog > 5000) {
      const line = data.toString().trim().split('\n').pop() || ''
      if (line.includes('frame=') || line.includes('time=')) {
        console.log(`[Transcoder] ${line}`)
      }
      lastLog = now
    }
  })

  proc.on('error', (err) => {
    console.error('[Transcoder] ffmpeg spawn error:', err)
  })

  proc.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`[Transcoder] ffmpeg exited with code ${code}`)
    } else {
      console.log('[Transcoder] ffmpeg finished successfully')
    }
  })

  return proc
}

/** Extract a short text-subtitle window as WebVTT. */
export function createSubtitleStream(
  input: string,
  subtitleStreamIndex: number,
  startSeconds: number,
  durationSeconds: number
): ChildProcess {
  const safeStart = Math.max(0, Number.isFinite(startSeconds) ? startSeconds : 0)
  const safeDuration = Math.max(1, Math.min(60, Number.isFinite(durationSeconds) ? durationSeconds : 30))
  const args: string[] = ['-v', 'error', '-copyts']

  // Input seeking keeps torrent reads close to the requested playback window.
  // Preserving timestamps lets every returned cue stay on the full movie timeline.
  if (safeStart > 0) args.push('-ss', safeStart.toFixed(3))

  args.push(
    '-i', input,
    '-to', (safeStart + safeDuration).toFixed(3),
    '-map', `0:${subtitleStreamIndex}`,
    '-vn',
    '-an',
    '-c:s', 'webvtt',
    '-f', 'webvtt',
    'pipe:1'
  )

  console.log(
    `[Transcoder] Subtitle window: track=${subtitleStreamIndex} `
    + `start=${safeStart.toFixed(3)}s duration=${safeDuration.toFixed(3)}s`
  )
  return spawn(ffmpegPath, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

/**
 * Get the on-disk path for a WebTorrent file.
 * WebTorrent stores files at: <downloadPath>/<torrentName>/<filePath>
 */
export function getFileDiskPath(downloadPath: string, torrentName: string, filePath: string): string {
  return path.join(downloadPath, filePath)
}

/** Check if ffmpeg is available */
export function isFFmpegAvailable(): boolean {
  return !!ffmpegPath
}

/** Get the ffmpeg binary path */
export function getFFmpegPath(): string {
  return ffmpegPath
}
