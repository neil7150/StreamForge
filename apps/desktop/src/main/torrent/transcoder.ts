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

// ─── Supported codecs (natively by Chromium) ─────────────────────────

/** Video codecs Chromium can play natively */
const SUPPORTED_VIDEO_CODECS = new Set([
  'h264', 'avc', 'avc1',
  'vp8', 'vp9',
  'av1',
  'theora'
])

/** Audio codecs Chromium can play natively */
const SUPPORTED_AUDIO_CODECS = new Set([
  'aac', 'mp3', 'mp2',
  'opus', 'vorbis',
  'flac',
  'pcm_s16le', 'pcm_s24le', 'pcm_f32le' // WAV
])

// ─── Types ───────────────────────────────────────────────────────────

export interface ProbeResult {
  videoCodec: string | null
  audioCodec: string | null
  duration: number
  width: number
  height: number
  needsVideoTranscode: boolean
  needsAudioTranscode: boolean
  needsTranscode: boolean
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Probe a video file to detect its codecs and whether transcoding is needed.
 * Uses ffprobe from @ffprobe-installer/ffprobe.
 */
export async function probeFile(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath
    ]

    const proc = spawn(ffprobePath, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        console.warn(`[Transcoder] ffprobe exited with code ${code}: ${stderr}`)
        // If ffprobe fails, assume transcoding is needed as a safe fallback
        resolve({
          videoCodec: null,
          audioCodec: null,
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

        let videoCodec: string | null = null
        let audioCodec: string | null = null
        let width = 0
        let height = 0

        for (const stream of streams) {
          if (stream.codec_type === 'video' && !videoCodec) {
            videoCodec = (stream.codec_name || '').toLowerCase()
            width = stream.width || 0
            height = stream.height || 0
          }
          if (stream.codec_type === 'audio' && !audioCodec) {
            audioCodec = (stream.codec_name || '').toLowerCase()
          }
        }

        const needsVideoTranscode = videoCodec
          ? !SUPPORTED_VIDEO_CODECS.has(videoCodec)
          : false

        const needsAudioTranscode = audioCodec
          ? !SUPPORTED_AUDIO_CODECS.has(audioCodec)
          : false

        const result: ProbeResult = {
          videoCodec,
          audioCodec,
          duration: parseFloat(format.duration) || 0,
          width,
          height,
          needsVideoTranscode,
          needsAudioTranscode,
          needsTranscode: needsVideoTranscode || needsAudioTranscode
        }

        console.log(
          `[Transcoder] Probed: video=${videoCodec} audio=${audioCodec} ` +
          `${result.width}x${result.height} ${result.duration.toFixed(1)}s ` +
          `transcode=${result.needsTranscode ? 'YES' : 'no'} ` +
          `(video=${needsVideoTranscode ? 'YES' : 'no'} audio=${needsAudioTranscode ? 'YES' : 'no'})`
        )

        resolve(result)
      } catch (err) {
        console.error('[Transcoder] Failed to parse ffprobe output:', err)
        resolve({
          videoCodec: null,
          audioCodec: null,
          duration: 0,
          width: 0,
          height: 0,
          needsVideoTranscode: true,
          needsAudioTranscode: true,
          needsTranscode: true
        })
      }
    })

    proc.on('error', (err) => {
      console.error('[Transcoder] ffprobe spawn error:', err)
      reject(err)
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
 * @param filePath - Path to the source video file on disk
 * @param probe - Probe result to decide what to transcode
 * @param seekSeconds - Optional: start from this time position (for seeking)
 * @returns The spawned ChildProcess — pipe `proc.stdout` to your HTTP response
 */
export function createTranscodeStream(
  filePath: string,
  probe: ProbeResult,
  seekSeconds: number = 0
): ChildProcess {
  const args: string[] = []

  // Seek position (must come before -i for fast seeking)
  if (seekSeconds > 0) {
    args.push('-ss', seekSeconds.toString())
  }

  // Input
  args.push('-i', filePath)

  // Video codec
  if (probe.needsVideoTranscode) {
    // Full transcode to H.264
    args.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',  // Fastest encoding for real-time streaming
      '-tune', 'zerolatency',  // Low latency for streaming
      '-crf', '23',            // Good quality with reasonable file size
      '-pix_fmt', 'yuv420p'    // Ensure compatibility with all players
    )
    console.log(`[Transcoder] Video: ${probe.videoCodec} → H.264 (transcoding)`)
  } else {
    // Copy video stream (no re-encoding, very fast)
    args.push('-c:v', 'copy')
    console.log(`[Transcoder] Video: ${probe.videoCodec} → copy (passthrough)`)
  }

  // Audio codec
  if (probe.needsAudioTranscode) {
    // Transcode to AAC
    args.push(
      '-c:a', 'aac',
      '-b:a', '192k',   // Good audio quality
      '-ac', '2'         // Stereo (prevents issues with 5.1/7.1 AC3/DTS)
    )
    console.log(`[Transcoder] Audio: ${probe.audioCodec} → AAC (transcoding)`)
  } else {
    // Copy audio stream
    args.push('-c:a', 'copy')
    console.log(`[Transcoder] Audio: ${probe.audioCodec} → copy (passthrough)`)
  }

  // Output format: fragmented MP4 to stdout
  // -movflags frag_keyframe+empty_moov makes the MP4 streamable from the start
  // (no need for the moov atom at the end of the file)
  args.push(
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+faststart',
    '-map', '0:v:0',   // First video stream
    '-map', '0:a:0?',  // First audio stream (? = optional, won't fail if no audio)
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
