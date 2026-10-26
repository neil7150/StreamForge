import test from 'node:test'
import assert from 'node:assert/strict'
import { HydratedStorage, scopeLibraryKey } from '../src/storage/hydrated-storage.ts'

test('account libraries and guest history have distinct persistent keys', () => {
  const key = 'streamforge_library_v2'
  assert.notEqual(scopeLibraryKey(key, 'A'), scopeLibraryKey(key, 'B'))
  assert.notEqual(scopeLibraryKey(key, null), scopeLibraryKey(key, 'guest'))
  assert.equal(scopeLibraryKey('streamforge_access_token', 'A'), 'streamforge_access_token')
})

test('hydration gates reads, queued writes survive a fresh storage instance', async () => {
  const disk = new Map<string, string>([['settings', 'old']])
  const backing = {
    getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => { disk.set(key, value) },
    removeItem: async (key: string) => { disk.delete(key) }
  }
  const first = new HydratedStorage(backing)
  assert.throws(() => first.getItem('settings'), /loading/)
  await first.hydrate(['settings'])
  first.setItem('settings', 'one')
  first.setItem('settings', 'two')
  first.setItem('token', 'secret')
  first.removeItem('token')
  await first.flush()
  const restarted = new HydratedStorage(backing)
  await restarted.hydrate(['settings', 'token'])
  assert.equal(restarted.getItem('settings'), 'two')
  assert.equal(restarted.getItem('token'), null)
})

test('failed writes are visible and retry retains the latest value', async () => {
  let failing = true
  const disk = new Map<string, string>()
  const storage = new HydratedStorage({
    getItem: async () => null,
    setItem: async (key, value) => { if (failing) throw new Error('disk full'); disk.set(key, value) },
    removeItem: async key => { disk.delete(key) }
  })
  await storage.hydrate([])
  storage.setItem('history', 'latest')
  await assert.rejects(storage.flush(), /could not be saved/)
  failing = false
  await storage.flush()
  assert.equal(disk.get('history'), 'latest')
})
