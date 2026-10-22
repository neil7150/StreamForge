import test from 'node:test'
import assert from 'node:assert/strict'
import { useAuthStore } from '../../../packages/core/src/stores/authStore.ts'
import { useUserDataStore } from '../../../packages/core/src/stores/userDataStore.ts'
import { setStorageAdapter } from '../../../packages/core/src/stores/storage-adapter.ts'
import { api } from '../../../packages/core/src/clients/api.ts'

const user = (id: string) => ({ id, email: `${id}@example.com`, role: 'user', email_verified: true, is_active: true })
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

test('logout rejects late login and refresh responses; refresh requests are serialized', async t => {
  const values = new Map<string, string>()
  setStorageAdapter({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } })
  const original = { login: api.login, logout: api.logout, refresh: api.refresh, watchlist: api.getCloudWatchlist, history: api.getCloudHistory, saveWatchlist: api.syncWatchlist, saveHistory: api.syncHistory }
  api.syncWatchlist = async () => ({})
  api.syncHistory = async () => ({})
  api.logout = async () => ({})
  api.getCloudWatchlist = async () => ({ data: [] })
  api.getCloudHistory = async () => ({ data: [] })
  t.after(() => { api.login = original.login; api.logout = original.logout; api.refresh = original.refresh; api.getCloudWatchlist = original.watchlist; api.getCloudHistory = original.history; api.syncWatchlist = original.saveWatchlist; api.syncHistory = original.saveHistory })

  let resolveLogin!: (value: any) => void
  api.login = () => new Promise(resolve => { resolveLogin = resolve })
  const pendingLogin = useAuthStore.getState().login('a@example.com', 'password')
  await useAuthStore.getState().logout()
  resolveLogin({ data: { access_token: 'a', refresh_token: 'r', user: user('A') } })
  await pendingLogin
  assert.equal(useAuthStore.getState().isAuthenticated, false)

  useAuthStore.getState().setSession('a', 'r', user('A'))
  await settle()
  let resolveRefresh!: (value: any) => void
  let requests = 0
  api.refresh = () => { requests++; return new Promise(resolve => { resolveRefresh = resolve }) }
  const one = useAuthStore.getState().refreshAuth()
  const two = useAuthStore.getState().refreshAuth()
  assert.equal(one, two)
  assert.equal(requests, 1)
  await useAuthStore.getState().logout()
  resolveRefresh({ data: { access_token: 'late', refresh_token: 'late-r', user: user('A') } })
  assert.equal(await one, false)
  assert.equal(values.get('streamforge_access_token'), undefined)
})

test('cloud response for an earlier account cannot overwrite the active library', async t => {
  const original = { logout: api.logout, watchlist: api.getCloudWatchlist, history: api.getCloudHistory, saveWatchlist: api.syncWatchlist, saveHistory: api.syncHistory }
  api.syncWatchlist = async () => ({})
  api.syncHistory = async () => ({})
  api.logout = async () => ({})
  api.getCloudWatchlist = async () => ({ data: [] })
  api.getCloudHistory = async () => ({ data: [] })
  t.after(() => { api.logout = original.logout; api.getCloudWatchlist = original.watchlist; api.getCloudHistory = original.history; api.syncWatchlist = original.saveWatchlist; api.syncHistory = original.saveHistory })
  useAuthStore.getState().setSession('a', 'r', user('A'))
  await settle()
  let resolveWatchlist!: (value: any) => void
  api.getCloudWatchlist = () => new Promise(resolve => { resolveWatchlist = resolve })
  const sync = useUserDataStore.getState().syncFromCloud()
  await useAuthStore.getState().logout()
  useUserDataStore.setState({ watchlist: [], history: [] })
  resolveWatchlist({ data: [{ content_key: 'private-A', title: 'Account A private title' }] })
  await sync
  assert.deepEqual(useUserDataStore.getState().watchlist, [])
})

test('a locally deleted item stays deleted when an older cloud snapshot arrives after reload', async t => {
  const original = { logout: api.logout, watchlist: api.getCloudWatchlist, history: api.getCloudHistory, saveWatchlist: api.syncWatchlist, saveHistory: api.syncHistory }
  api.logout = async () => ({})
  api.getCloudWatchlist = async () => ({ data: [] })
  api.getCloudHistory = async () => ({ data: [] })
  api.syncWatchlist = async () => ({})
  api.syncHistory = async () => ({})
  t.after(() => { api.logout = original.logout; api.getCloudWatchlist = original.watchlist; api.getCloudHistory = original.history; api.syncWatchlist = original.saveWatchlist; api.syncHistory = original.saveHistory })
  useAuthStore.getState().setSession('a', 'r', user('A'))
  await settle()
  useUserDataStore.getState().addToWatchlist({ movieId: 'removed', slug: 'removed', title: 'Removed title', poster: '', year: 2020, rating: 0, magnetURI: '' })
  useUserDataStore.getState().removeFromWatchlist('removed')
  useUserDataStore.getState()._loadFromStorage()
  api.getCloudWatchlist = async () => ({ data: [{ content_key: 'removed', title: 'Removed title' }] })
  await useUserDataStore.getState().syncFromCloud()
  assert.equal(useUserDataStore.getState().watchlist.some(item => item.movieId === 'removed'), false)
  await useAuthStore.getState().logout()
})
