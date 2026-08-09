import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getFFmpegPath } from '../../src/main/torrent/transcoder.ts'

export interface MediaFixtures {
  root: string
  directMp4: string
  h264Ac3Mkv: string
  hevcAacMkv: string
  hevcAc3Mkv: string
  multiTrackMkv: string
  externalSrt: string
  cleanupMkv: string
}

const SHORT_DURATION = 4

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(getFFmpegPath(), [
      '-nostdin',
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      ...args
    ], { windowsHide: true })
    let stderr = ''
    const timeout = setTimeout(() => {
      process.kill('SIGTERM')
      reject(new Error(`Fixture generation timed out: ${args.at(-1)}`))
    }, 30_000)

    process.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 16_384) stderr += chunk.toString()
    })
    process.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    process.once('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg fixture generation failed (${code}): ${stderr.trim()}`))
    })
  })
}

function videoInput(duration: number, size = '320x180'): string[] {
  return ['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30:duration=${duration}`]
}

function audioInput(frequency: number, duration: number): string[] {
  return ['-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=${duration}`]
}

const h264Args = [
  '-c:v', 'libx264',
  '-preset', 'ultrafast',
  '-pix_fmt', 'yuv420p',
  '-g', '15',
  '-keyint_min', '15',
  '-sc_threshold', '0'
]

const hevcArgs = [
  '-c:v', 'libx265',
  '-preset', 'ultrafast',
  '-pix_fmt', 'yuv420p',
  '-x265-params', 'log-level=error:pools=1:frame-threads=1:keyint=15:min-keyint=15:scenecut=0'
]

async function createSingleAudioFixture(
  output: string,
  videoCodec: 'h264' | 'hevc',
  audioCodec: 'aac' | 'ac3',
  duration = SHORT_DURATION,
  size = '320x180'
): Promise<void> {
  await runFFmpeg([
    ...videoInput(duration, size),
    ...audioInput(440, duration),
    '-map', '0:v:0',
    '-map', '1:a:0',
    ...(videoCodec === 'h264' ? h264Args : hevcArgs),
    '-c:a', audioCodec,
    '-b:a', '96k',
    '-t', String(duration),
    output
  ])
}

export async function createMediaFixtures(): Promise<MediaFixtures> {
  const root = await mkdtemp(path.join(tmpdir(), 'streamforge-media-'))
  const fixtures: MediaFixtures = {
    root,
    directMp4: path.join(root, 'h264-aac.mp4'),
    h264Ac3Mkv: path.join(root, 'h264-ac3.mkv'),
    hevcAacMkv: path.join(root, 'hevc-aac.mkv'),
    hevcAc3Mkv: path.join(root, 'hevc-ac3.mkv'),
    multiTrackMkv: path.join(root, 'multi-audio-subtitle.mkv'),
    externalSrt: path.join(root, 'external.srt'),
    cleanupMkv: path.join(root, 'cleanup-h264-ac3.mkv')
  }

  const subtitles = [
    '1',
    '00:00:00,500 --> 00:00:01,800',
    'Compatibility subtitle one',
    '',
    '2',
    '00:00:03,200 --> 00:00:03,900',
    'Compatibility subtitle two',
    ''
  ].join('\n')
  await writeFile(fixtures.externalSrt, subtitles, 'utf8')

  await createSingleAudioFixture(fixtures.directMp4, 'h264', 'aac')
  await createSingleAudioFixture(fixtures.h264Ac3Mkv, 'h264', 'ac3')
  await createSingleAudioFixture(fixtures.hevcAacMkv, 'hevc', 'aac')
  await createSingleAudioFixture(fixtures.hevcAc3Mkv, 'hevc', 'ac3')

  await runFFmpeg([
    ...videoInput(SHORT_DURATION),
    ...audioInput(440, SHORT_DURATION),
    ...audioInput(880, SHORT_DURATION),
    '-f', 'srt', '-i', fixtures.externalSrt,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-map', '2:a:0',
    '-map', '3:s:0',
    ...h264Args,
    '-c:a:0', 'aac',
    '-c:a:1', 'ac3',
    '-b:a', '96k',
    '-c:s', 'srt',
    '-metadata:s:a:0', 'language=eng',
    '-metadata:s:a:0', 'title=Direct AAC',
    '-disposition:a:0', 'default',
    '-metadata:s:a:1', 'language=spa',
    '-metadata:s:a:1', 'title=Compatibility AC3',
    '-disposition:a:1', '0',
    '-metadata:s:s:0', 'language=eng',
    '-metadata:s:s:0', 'title=English',
    '-disposition:s:0', 'default',
    '-t', String(SHORT_DURATION),
    fixtures.multiTrackMkv
  ])

  await createSingleAudioFixture(fixtures.cleanupMkv, 'h264', 'ac3', 30, '160x90')
  return fixtures
}
