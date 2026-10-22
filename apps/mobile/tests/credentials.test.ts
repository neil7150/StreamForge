import test from 'node:test'
import assert from 'node:assert/strict'
import { createMobileBacking, createMobileAdapter, SETTINGS_KEY, SESSION_RECORD_KEY } from '../src/storage/mobile-backing.ts'
import { HydratedStorage } from '../src/storage/hydrated-storage.ts'

test('an account session is persisted as one secure record and logout deletes the whole record', async () => {
  const disk = new Map<string, string>()
  let writes = 0
  const backing = {
    getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => { writes++; disk.set(key, value) },
    removeItem: async (key: string) => { disk.delete(key) }
  }
  const mirror = new HydratedStorage(backing)
  await mirror.hydrate([SESSION_RECORD_KEY])
  const adapter = createMobileAdapter(mirror, () => 'A')
  const entries: [string, string][] = [['streamforge_access_token', 'access-A'], ['streamforge_refresh_token', 'refresh-A'], ['streamforge_user', '{"id":"A"}']]
  adapter.setItems(entries)
  await mirror.flush()
  assert.equal(writes, 1)
  assert.equal(disk.size, 1)
  const restarted = new HydratedStorage(backing)
  await restarted.hydrate([SESSION_RECORD_KEY])
  const loaded = createMobileAdapter(restarted, () => 'A')
  for (const [key, value] of entries) assert.equal(loaded.getItem(key), value)
  loaded.removeItems(entries.map(([key]) => key))
  await restarted.flush()
  assert.equal(disk.size, 0)
})

test('tokens and provider keys are routed only to secure storage; settings rehydrate with their secrets', async () => {
  const regular = new Map<string, string>()
  const encrypted = new Map<string, string>()
  const adapter = (disk: Map<string, string>) => ({ getItem: async (key: string) => disk.get(key) ?? null, setItem: async (key: string, value: string) => { disk.set(key, value) }, removeItem: async (key: string) => { disk.delete(key) } })
  const backing = createMobileBacking(adapter(regular), adapter(encrypted))
  await backing.setItem('streamforge_refresh_token', 'private-token')
  const settings = { preferredQuality: '720p', openSubtitlesApiKey: 'private-key', torznabEndpoints: [{ url: 'https://example.com', apiKey: 'private-indexer-key' }] }
  await backing.setItem(SETTINGS_KEY, JSON.stringify(settings))
  assert.equal(JSON.stringify([...regular]).includes('private-'), false)
  assert.deepEqual(JSON.parse((await backing.getItem(SETTINGS_KEY))!), settings)
  await backing.removeItem('streamforge_refresh_token')
  assert.equal(await backing.getItem('streamforge_refresh_token'), null)
})

test('secure storage read failures are surfaced, rather than silently discarding saved keys', async () => {
  const backing = createMobileBacking({ getItem: async () => '{}', setItem: async () => {}, removeItem: async () => {} }, { getItem: async () => { throw new Error('keystore unavailable') }, setItem: async () => {}, removeItem: async () => {} })
  await assert.rejects(backing.getItem(SETTINGS_KEY), /keystore unavailable/)
})
