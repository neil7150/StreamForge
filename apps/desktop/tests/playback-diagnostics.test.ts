import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPlaybackDiagnosticsReport,
  playbackDiagnosticsFilename,
  serializePlaybackDiagnostics
} from '../src/renderer/src/lib/playback-diagnostics.ts'

const NOW = Date.parse('2026-08-03T12:00:00.000Z')

test('builds a safe playback report with elapsed timings and sanitized source URL', () => {
  const report = buildPlaybackDiagnosticsReport({
    infoHash: 'a'.repeat(40),
    streamURL: 'media://stream/' + 'a'.repeat(40) + '?session=secret&request=4',
    selectedFileIndex: 2,
    selectedAudioTrackIndex: 1,
    connection: {
      phase: 'buffering',
      startedAt: NOW - 12_000,
      phaseStartedAt: NOW - 2_500,
      connectionAttempt: 1,
      mediaProbeAttempts: 2,
      streamURLAttempts: 3,
      playbackRequest: 4,
      lastSeekTarget: 600
    },
    playback: {
      currentTime: 601,
      duration: 3600,
      bufferedAhead: 22,
      bufferedRanges: [{ start: 598, end: 623 }],
      readyState: 3,
      networkState: 2,
      paused: false,
      seeking: false,
      buffering: true,
      lastEvent: 'waiting',
      loadRetryCount: 1,
      timelineOffset: 600
    },
    errors: [null, 'decoder recovered'],
    userAgent: 'test-runtime'
  }, NOW)

  assert.equal(report.connection.elapsedMs, 12_000)
  assert.equal(report.connection.phaseElapsedMs, 2_500)
  assert.equal(report.playback?.source, 'media://stream/' + 'a'.repeat(40))
  assert.deepEqual(report.errors, ['decoder recovered'])
  assert.equal(report.app.platform, 'test-runtime')
})

test('normalizes missing and invalid numeric values', () => {
  const report = buildPlaybackDiagnosticsReport({
    infoHash: 'b'.repeat(40),
    progress: {
      infoHash: 'b'.repeat(40),
      progress: Number.NaN,
      downloadSpeed: Number.POSITIVE_INFINITY,
      uploadSpeed: 0,
      numPeers: 4,
      downloaded: 10,
      uploaded: 0,
      totalSize: 20,
      timeRemaining: 0,
      ratio: 0,
      bufferProgress: 0.25,
      mode: 'stream',
      peerConnections: {
        discovered: 12,
        pending: 5,
        connected: 4,
        fastTcpFallbacksArmed: 8,
        bySource: { tracker: 7, dht: 3, lsd: 0, pex: 2, manual: 0, unknown: 0 },
        byTransport: { tcp: 1, utp: 3, webrtc: 0, webseed: 0, unknown: 0 }
      }
    },
    selectedFileIndex: null,
    selectedAudioTrackIndex: null,
    connection: {
      phase: 'connecting',
      startedAt: NOW + 100,
      phaseStartedAt: NOW + 100,
      connectionAttempt: 0,
      mediaProbeAttempts: 0,
      streamURLAttempts: 0,
      playbackRequest: 0,
      lastSeekTarget: null
    },
    playback: null,
    errors: []
  }, NOW)

  assert.equal(report.torrent.progress, 0)
  assert.equal(report.torrent.downloadSpeed, 0)
  assert.equal(report.torrent.peerConnections?.byTransport.utp, 3)
  assert.equal(report.torrent.peerConnections?.bySource.tracker, 7)
  assert.equal(report.connection.elapsedMs, 0)
  assert.equal(report.media.playbackMode, 'unknown')
})

test('serializes reports and creates a portable filename', () => {
  const report = buildPlaybackDiagnosticsReport({
    infoHash: 'c'.repeat(40),
    selectedFileIndex: null,
    selectedAudioTrackIndex: null,
    connection: {
      phase: 'playing',
      startedAt: NOW,
      phaseStartedAt: NOW,
      connectionAttempt: 0,
      mediaProbeAttempts: 1,
      streamURLAttempts: 1,
      playbackRequest: 1,
      lastSeekTarget: null
    },
    playback: null,
    errors: []
  }, NOW)

  assert.equal(JSON.parse(serializePlaybackDiagnostics(report)).schemaVersion, 1)
  assert.equal(playbackDiagnosticsFilename(report), 'streamforge-diagnostics-2026-08-03_12-00-00-000.json')
})
