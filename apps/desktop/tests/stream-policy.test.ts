import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateAheadSeconds,
  calculateMetadataTailPieceRange,
  calculateStartupCriticalEndPiece,
  calculateStartupBufferBytes,
  calculateStreamWindow,
  FALLBACK_STARTUP_BUFFER_BYTES,
  MAX_AHEAD_SECONDS,
  MIN_AHEAD_SECONDS,
  RETAINED_BEHIND_SECONDS
} from '../src/main/torrent/stream-policy.ts'
import {
  classifyTranscodeRequest,
  isSameTranscodeRequest,
  parseTranscodeRequestIdentity
} from '../src/main/torrent/transcode-session-policy.ts'
import {
  getRequestedAudioTrackIndex,
  isTimelineSeekRequest,
  requiresTimestampMediaPipeline
} from '../src/main/torrent/playback-request-policy.ts'
import { isAudioCodecSupported, isTextSubtitleCodec, selectAudioTrack } from '../src/main/torrent/media-track-policy.ts'
import {
  getLocalPlaybackTime,
  getUnclampedLocalSeekTime,
  isAbsolutePlaybackTimeBuffered,
  isPlaybackTimeAtRequestedSeek
} from '../src/renderer/src/lib/playback-seek.ts'
import { findActiveSubtitleCue, parseSubtitles } from '../src/renderer/src/lib/subtitle-policy.ts'
import {
  cancelScheduledStreamCleanup,
  hasScheduledStreamCleanup,
  scheduleStreamCleanup
} from '../src/renderer/src/lib/stream-cleanup-scheduler.ts'
import { createLatestTaskScheduler } from '../src/renderer/src/lib/latest-task-scheduler.ts'

const MIB = 1024 * 1024

test('forward cache remains between 45 and 90 seconds', () => {
  const bytesPerSecond = 2 * MIB
  assert.equal(calculateAheadSeconds(6 * MIB, bytesPerSecond), MIN_AHEAD_SECONDS)
  assert.equal(calculateAheadSeconds(3.2 * MIB, bytesPerSecond), 60)
  assert.equal(calculateAheadSeconds(2 * MIB, bytesPerSecond), MAX_AHEAD_SECONDS)
  assert.equal(calculateAheadSeconds(20 * MIB, bytesPerSecond, true), MAX_AHEAD_SECONDS)
})

test('window evicts watched data after the retention allowance', () => {
  const policy = calculateStreamWindow({
    fileLength: 9 * 1024 * MIB,
    duration: 3434.7,
    currentTime: 1800,
    downloadSpeed: 5 * MIB
  })

  const retainedSeconds = 1800 - policy.startByte / policy.bytesPerSecond
  const aheadSeconds = policy.endByte / policy.bytesPerSecond - 1800
  assert.ok(retainedSeconds <= RETAINED_BEHIND_SECONDS + 0.01)
  assert.ok(aheadSeconds >= MIN_AHEAD_SECONDS)
  assert.ok(aheadSeconds <= MAX_AHEAD_SECONDS + 0.01)
  assert.ok(policy.endByte < 9 * 1024 * MIB)
})

test('startup buffer scales with bitrate and stays bounded', () => {
  assert.equal(calculateStartupBufferBytes(), FALLBACK_STARTUP_BUFFER_BYTES)
  assert.equal(calculateStartupBufferBytes(128 * 1024), 8 * MIB)
  assert.equal(calculateStartupBufferBytes(2 * MIB), 30 * MIB)
  assert.equal(calculateStartupBufferBytes(20 * MIB), 64 * MIB)
})

test('startup urgency stays near eight MiB regardless of torrent piece size', () => {
  assert.equal(calculateStartupCriticalEndPiece(10, 100, 256 * 1024), 41)
  assert.equal(calculateStartupCriticalEndPiece(10, 100, 1024 * 1024), 17)
  assert.equal(calculateStartupCriticalEndPiece(10, 100, 4 * MIB), 11)
  assert.equal(calculateStartupCriticalEndPiece(10, 11, 256 * 1024), 11)
})

test('metadata tail priority is bounded and excludes the active startup range', () => {
  assert.deepEqual(
    calculateMetadataTailPieceRange(0, 100 * MIB, MIB, 9),
    { start: 98, end: 99 }
  )
  assert.equal(calculateMetadataTailPieceRange(0, 8 * MIB, MIB, 7), null)
  assert.deepEqual(
    calculateMetadataTailPieceRange(3 * MIB, 100 * MIB, MIB),
    { start: 101, end: 102 }
  )
})

test('transcode generations reject duplicate and stale browser requests', () => {
  const existing = { sessionId: 'playback-a', requestId: 4 }
  assert.equal(classifyTranscodeRequest(null, existing), 'start')
  assert.equal(classifyTranscodeRequest(existing, existing), 'duplicate')
  assert.equal(
    classifyTranscodeRequest(existing, { sessionId: 'playback-a', requestId: 3 }),
    'stale'
  )
  assert.equal(
    classifyTranscodeRequest(existing, { sessionId: 'playback-a', requestId: 5 }),
    'replace'
  )
  assert.equal(
    classifyTranscodeRequest(existing, { sessionId: 'playback-b', requestId: 1 }),
    'replace'
  )
  assert.deepEqual(
    parseTranscodeRequestIdentity('/source/hash?consumer=transcode&session=playback-a&request=5', 'http://localhost'),
    { sessionId: 'playback-a', requestId: 5 }
  )
  assert.equal(isSameTranscodeRequest(existing, { sessionId: 'playback-a', requestId: 4 }), true)
  assert.equal(isSameTranscodeRequest(existing, { sessionId: 'playback-a', requestId: 5 }), false)
})
test('direct-stream retries resume at the requested absolute timestamp', () => {
  assert.equal(getLocalPlaybackTime(1800, 0, 3434.7), 1800)
  assert.equal(getLocalPlaybackTime(1800, 1700, 1734.7), 100)
  assert.equal(getLocalPlaybackTime(4000, 0, 3434.7), 3434.7)
  assert.equal(getLocalPlaybackTime(-10, 0, 3434.7), 0)
})

test('long seeks are not clamped to Chromium transient fragment duration', () => {
  assert.equal(getLocalPlaybackTime(3000, 0, 1200), 1200)
  assert.equal(getUnclampedLocalSeekTime(3000, 0), 3000)
  assert.equal(getUnclampedLocalSeekTime(3000, 1200), 1800)
})
test('buffer checks use the full timeline instead of clamping before a fragment', () => {
  const fragmentRanges = [{ start: 0, end: 30 }]
  assert.equal(isAbsolutePlaybackTimeBuffered(2_990, 3_000, fragmentRanges), false)
  assert.equal(isAbsolutePlaybackTimeBuffered(2_999.9, 3_000, fragmentRanges), false)
  assert.equal(isAbsolutePlaybackTimeBuffered(3_010, 3_000, fragmentRanges), true)
  assert.equal(isAbsolutePlaybackTimeBuffered(3_040, 3_000, fragmentRanges), false)
})
test('stale time updates cannot overwrite a pending seek target', () => {
  assert.equal(isPlaybackTimeAtRequestedSeek(1_200, 3_000), false)
  assert.equal(isPlaybackTimeAtRequestedSeek(2_999.25, 3_000), true)
})
test('rapid skip work is coalesced to the latest playback target', async () => {
  const scheduler = createLatestTaskScheduler(10)
  const startedTargets: number[] = []

  const first = scheduler.schedule(() => { startedTargets.push(610) })
  const second = scheduler.schedule(() => { startedTargets.push(620) })
  const third = scheduler.schedule(() => { startedTargets.push(630) })

  await Promise.all([first, second, third])
  assert.deepEqual(startedTargets, [630])
})
test('timeline seeks use the timestamp-aware remux path', () => {
  const baseURL = 'http://127.0.0.1:4567'
  assert.equal(isTimelineSeekRequest('/stream/hash?session=a&request=1', baseURL), false)
  assert.equal(isTimelineSeekRequest('/stream/hash?session=a&request=2&start=1800.000', baseURL), true)
  assert.equal(isTimelineSeekRequest('/stream/hash?start=0.000', baseURL), true)
})
test('audio track requests select the timestamp-aware media pipeline', () => {
  const baseURL = 'http://127.0.0.1:4567'
  assert.equal(getRequestedAudioTrackIndex('/stream/hash?audio=3', baseURL), 3)
  assert.equal(getRequestedAudioTrackIndex('/stream/hash?audio=-1', baseURL), null)
  assert.equal(getRequestedAudioTrackIndex('/stream/hash?audio=abc', baseURL), null)
  assert.equal(requiresTimestampMediaPipeline('/stream/hash?audio=3', baseURL), true)
  assert.equal(requiresTimestampMediaPipeline('/stream/hash?request=1', baseURL), false)
})

test('selected audio track controls codec compatibility independently', () => {
  const tracks = [
    {
      index: 1,
      codec: 'aac',
      language: 'eng',
      title: 'English',
      channels: 2,
      channelLayout: 'stereo',
      isDefault: true
    },
    {
      index: 2,
      codec: 'ac3',
      language: 'hin',
      title: 'Hindi 5.1',
      channels: 6,
      channelLayout: '5.1',
      isDefault: false
    }
  ]

  assert.equal(selectAudioTrack(tracks, 2)?.language, 'hin')
  assert.equal(selectAudioTrack(tracks, 99)?.index, 1)
  assert.equal(isAudioCodecSupported('aac'), true)
  assert.equal(isAudioCodecSupported('ac3'), false)
})
test('SRT and VTT subtitles parse and honor synchronization offsets', () => {
  const cues = parseSubtitles(`WEBVTT

00:00:10.000 --> 00:00:12.500
<font color="white">Hello</font>

2
00:00:15,000 --> 00:00:17,000
World`)

  assert.deepEqual(cues, [
    { start: 10, end: 12.5, text: 'Hello' },
    { start: 15, end: 17, text: 'World' }
  ])
  assert.equal(findActiveSubtitleCue(cues, 11, 0)?.text, 'Hello')
  assert.equal(findActiveSubtitleCue(cues, 16, 5)?.text, 'Hello')
  assert.equal(findActiveSubtitleCue(cues, 11, -5)?.text, 'World')
})
test('embedded text subtitles are classified and offset into the movie timeline', () => {
  assert.equal(isTextSubtitleCodec('subrip'), true)
  assert.equal(isTextSubtitleCodec('ass'), true)
  assert.equal(isTextSubtitleCodec('hdmv_pgs_subtitle'), false)
  assert.equal(isTextSubtitleCodec('dvd_subtitle'), false)

  const cues = parseSubtitles(`[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:02.00,0:00:04.50,Default,,0,0,0,,Hello\\Nworld`, 120)

  assert.deepEqual(cues, [
    { start: 122, end: 124.5, text: 'Hello\nworld' }
  ])
})
test('deferred stream cleanup survives remount cancellation and runs after real navigation', async () => {
  const hash = '0123456789abcdef0123456789abcdef01234567'
  let cleanupCount = 0

  scheduleStreamCleanup(hash, () => { cleanupCount++ }, 15)
  assert.equal(hasScheduledStreamCleanup(hash.toUpperCase()), true)
  cancelScheduledStreamCleanup(hash)
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(cleanupCount, 0)
  assert.equal(hasScheduledStreamCleanup(hash), false)

  scheduleStreamCleanup(hash, () => { cleanupCount++ }, 0)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(cleanupCount, 1)
  assert.equal(hasScheduledStreamCleanup(hash), false)
})
