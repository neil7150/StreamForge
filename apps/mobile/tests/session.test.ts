import test from 'node:test'
import assert from 'node:assert/strict'
import { PlaybackSessionManager, type SessionBackend, type SessionInfo } from '../src/playback/session-manager.ts'

const fixture = (id: string): SessionInfo => ({ sessionId: id, infoHash: 'hash', name: 'movie', files: [], totalSize: 10, selectedFileIndex: 0, requiresFileSelection: false, streamURL: 'http://127.0.0.1/media', ready: true })
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

test('leaving while metadata resolves cancels native work and rejects late results', async () => {
  let finish!: (info: SessionInfo) => void
  let id = ''
  let cancels = 0
  const manager = new PlaybackSessionManager({
    start: async () => {}, prepare: requestId => { id = requestId; return new Promise(resolve => { finish = resolve }) },
    cancel: async () => { cancels++; finish?.(fixture(id)) }, stop: async () => {}
  })
  const attempt = manager.open({ magnetURI: 'magnet:a' })
  const rejected = assert.rejects(attempt.result, /cancelled/)
  await settle()
  await attempt.close()
  await rejected
  assert.ok(cancels >= 1)
  assert.equal(attempt.close(), attempt.close())
})

test('retry of the same source gets a new session and waits for old cleanup', async () => {
  const events: string[] = []
  const backend: SessionBackend = {
    start: async () => { events.push('start') },
    prepare: async id => { events.push(id); return fixture(id) },
    cancel: async id => { events.push(`cancel:${id}`) },
    stop: async () => { events.push('stop') }
  }
  const manager = new PlaybackSessionManager(backend)
  const first = manager.open({ magnetURI: 'same' }); await first.result
  const second = manager.open({ magnetURI: 'same' }); await second.result
  assert.notEqual(first.id, second.id)
  assert.ok(events.indexOf(`cancel:${first.id}`) < events.indexOf(second.id))
  await manager.close()
})

test('close before startup completes never submits a torrent', async () => {
  let started!: () => void
  let preparations = 0
  const manager = new PlaybackSessionManager({
    start: () => new Promise<void>(resolve => { started = resolve }),
    prepare: async id => { preparations++; return fixture(id) }, cancel: async () => {}, stop: async () => {}
  })
  const attempt = manager.open({ magnetURI: 'magnet:a' })
  const rejection = assert.rejects(attempt.result, /cancelled/)
  const closed = attempt.close()
  started()
  await closed; await rejection
  assert.equal(preparations, 0)
})

test('a failed cancel still stops the engine and permits a subsequent playback attempt', async () => {
  let stops = 0
  const manager = new PlaybackSessionManager({
    start: async () => {}, prepare: async id => fixture(id),
    cancel: async () => { throw new Error('native cancel failed') },
    stop: async () => { stops++ }
  })
  const first = manager.open({ magnetURI: 'same' }); await first.result
  await first.close()
  const second = manager.open({ magnetURI: 'same' }); await second.result
  await second.close()
  assert.ok(stops >= 2)
})
