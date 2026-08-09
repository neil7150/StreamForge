import assert from 'node:assert/strict'
import type { ChildProcess } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { after, before, test } from 'node:test'
import {
  createSubtitleStream,
  createTranscodeStream,
  disableHardwareVideoEncoding,
  probeFile,
  type ProbeResult
} from '../src/main/torrent/transcoder.ts'
import { selectAudioTrack } from '../src/main/torrent/media-track-policy.ts'
import { findActiveSubtitleCue, parseSubtitles } from '../src/renderer/src/lib/subtitle-policy.ts'
import { createMediaFixtures, type MediaFixtures } from './helpers/media-fixtures.ts'

let fixtures: MediaFixtures

before(async () => {
  disableHardwareVideoEncoding()
  fixtures = await createMediaFixtures()
})

after(async () => {
  if (fixtures?.root) await rm(fixtures.root, { recursive: true, force: true })
})

function collectProcess(process: ChildProcess, timeoutMs = 30_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let stderr = ''
    const timeout = setTimeout(() => {
      process.kill('SIGTERM')
      reject(new Error(`Media process timed out: ${stderr.trim()}`))
    }, timeoutMs)

    process.stdout?.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
    process.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 16_384) stderr += chunk.toString()
    })
    process.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    process.once('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve(Buffer.concat(chunks))
      else reject(new Error(`Media process exited with ${code}: ${stderr.trim()}`))
    })
  })
}

async function transcodeToFixture(
  input: string,
  probe: ProbeResult,
  name: string,
  seekSeconds = 0,
  audioStreamIndex?: number
): Promise<ProbeResult> {
  const output = path.join(fixtures.root, name)
  const process = createTranscodeStream(input, probe, seekSeconds, false, audioStreamIndex)
  const content = await collectProcess(process)
  assert.ok(content.length > 1_000, 'transcode should emit playable media bytes')
  await writeFile(output, content)
  return probeFile(output)
}

test('classifies the supported and compatibility codec matrix', { timeout: 60_000 }, async () => {
  const cases = [
    { file: fixtures.directMp4, video: 'h264', audio: 'aac', videoTranscode: false, audioTranscode: false },
    { file: fixtures.h264Ac3Mkv, video: 'h264', audio: 'ac3', videoTranscode: false, audioTranscode: true },
    { file: fixtures.hevcAacMkv, video: 'hevc', audio: 'aac', videoTranscode: true, audioTranscode: false },
    { file: fixtures.hevcAc3Mkv, video: 'hevc', audio: 'ac3', videoTranscode: true, audioTranscode: true }
  ]

  for (const expected of cases) {
    const probe = await probeFile(expected.file)
    assert.equal(probe.videoCodec, expected.video)
    assert.equal(probe.audioCodec, expected.audio)
    assert.equal(probe.needsVideoTranscode, expected.videoTranscode)
    assert.equal(probe.needsAudioTranscode, expected.audioTranscode)
    assert.equal(probe.needsTranscode, expected.videoTranscode || expected.audioTranscode)
    assert.equal(probe.width, 320)
    assert.equal(probe.height, 180)
    assert.ok(probe.duration >= 3.8 && probe.duration <= 4.2)
  }
})

test('converts each incompatible codec combination to H.264 and AAC', { timeout: 60_000 }, async () => {
  const inputs = [fixtures.h264Ac3Mkv, fixtures.hevcAacMkv, fixtures.hevcAc3Mkv]
  for (const [index, input] of inputs.entries()) {
    const source = await probeFile(input)
    const output = await transcodeToFixture(input, source, `compatibility-${index}.mp4`)
    assert.equal(output.videoCodec, 'h264')
    assert.equal(output.audioCodec, 'aac')
    assert.equal(output.needsTranscode, false)
    assert.ok(output.duration >= 3.5 && output.duration <= 4.2)
  }
})

test('preserves a stable duration when seeking near the beginning, middle, and end', { timeout: 60_000 }, async () => {
  const source = await probeFile(fixtures.h264Ac3Mkv)
  const seeks = [
    { start: 0, remaining: 4 },
    { start: 2, remaining: 2 },
    { start: 3.25, remaining: 0.75 }
  ]

  for (const [index, seek] of seeks.entries()) {
    const output = await transcodeToFixture(
      fixtures.h264Ac3Mkv,
      source,
      `seek-${index}.mp4`,
      seek.start
    )
    assert.ok(output.duration > 0, `seek at ${seek.start}s should produce media`)
    assert.ok(
      Math.abs(output.duration - seek.remaining) <= 0.35,
      `seek at ${seek.start}s should expose about ${seek.remaining}s, got ${output.duration}s`
    )
  }
})

test('selects alternate audio and extracts embedded and external subtitles', { timeout: 60_000 }, async () => {
  const source = await probeFile(fixtures.multiTrackMkv)
  assert.equal(source.audioTracks.length, 2)
  assert.equal(source.subtitleTracks.length, 1)
  assert.equal(source.subtitleTracks[0].textBased, true)

  const defaultTrack = selectAudioTrack(source.audioTracks)
  const compatibilityTrack = source.audioTracks.find((track) => track.codec === 'ac3')
  assert.equal(defaultTrack?.codec, 'aac')
  assert.ok(compatibilityTrack)

  const selectedOutput = await transcodeToFixture(
    fixtures.multiTrackMkv,
    source,
    'selected-ac3-track.mp4',
    0,
    compatibilityTrack.index
  )
  assert.equal(selectedOutput.audioCodec, 'aac')
  assert.equal(selectedOutput.audioTracks.length, 1)

  const embedded = await collectProcess(
    createSubtitleStream(fixtures.multiTrackMkv, source.subtitleTracks[0].index, 3, 1)
  )
  const embeddedText = embedded.toString('utf8')
  assert.match(embeddedText, /^WEBVTT/)
  assert.match(embeddedText, /Compatibility subtitle two/)

  const externalText = await readFile(fixtures.externalSrt, 'utf8')
  const externalCues = parseSubtitles(externalText)
  assert.equal(externalCues.length, 2)
  assert.equal(findActiveSubtitleCue(externalCues, 3.5, 0)?.text, 'Compatibility subtitle two')
})

test('terminates an active compatibility process without leaving it running', { timeout: 30_000 }, async () => {
  const source = await probeFile(fixtures.cleanupMkv)
  const process = createTranscodeStream(fixtures.cleanupMkv, source, 0, true)

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Transcode did not produce startup data')), 10_000)
    process.once('error', reject)
    process.stdout?.once('data', () => {
      clearTimeout(timeout)
      resolve()
    })
  })

  const closed = new Promise<number | null>((resolve) => process.once('close', resolve))
  assert.equal(process.kill('SIGTERM'), true)
  await closed
  assert.equal(process.killed, true)
 })
