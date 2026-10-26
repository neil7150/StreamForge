import assert from 'node:assert/strict'
import { api } from '../packages/core/src/clients/api.ts'
import { useAuthStore } from '../packages/core/src/stores/authStore.ts'
import { useUserDataStore } from '../packages/core/src/stores/userDataStore.ts'
import { setStorageAdapter } from '../packages/core/src/stores/storage-adapter.ts'

// Two independent persisted libraries, using the actual mobile store and HTTP
// client. Activating a device reloads its record like a fresh app session.
export async function checkLibraryDevices(base) {
  api.setBaseURL(base)
  const email = `devices-${crypto.randomUUID()}@example.com`
  const password = 'Controlled-devices!287'
  await api.register(email, password)
  const a = new Map(); const b = new Map()
  const store = () => useUserDataStore.getState()
  const activate = async values => {
    if (useAuthStore.getState().isAuthenticated) await useAuthStore.getState().logout()
    // Authentication happens before selecting another device's durable adapter.
    const session = (await api.login(email, password)).data
    setStorageAdapter({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)})
    useAuthStore.getState().setSession(session.access_token,session.refresh_token,session.user)
    await new Promise(resolve=>setImmediate(resolve))
    await store().syncFromCloud()
    assert.equal(store().syncError,null)
  }
  const entry = movieId => ({movieId,slug:movieId,title:movieId,poster:'',year:2020,rating:0,magnetURI:''})
  try {
    await activate(a)
    store().addToWatchlist(entry('shared'))
    store().addToHistory({...entry('history'),contentKey:'movie:history',progress:0.2,currentTime:20,duration:100})
    await store().syncToCloud(); assert.equal(store().syncError,null)

    await activate(b)
    assert.equal(store().watchlist[0].movieId,'shared')
    assert.equal(store().history.length,1)
    // An unsent offline addition on B must survive deletion of shared items on A.
    store().addToWatchlist(entry('offline-B'))
    await activate(a)
    store().removeFromWatchlist('shared'); store().clearHistory()
    await store().syncToCloud(); assert.equal(store().syncError,null)

    await activate(b)
    assert.deepEqual(store().watchlist.map(item=>item.movieId),['offline-B'])
    assert.deepEqual(store().history,[])
    await store().syncToCloud(); assert.equal(store().syncError,null)
    assert.deepEqual((await api.getCloudWatchlist()).data.items.map(item=>item.content_key),['offline-B'])
    assert.deepEqual((await api.getCloudHistory()).data.items,[])

    // A successful deletion must not become a permanent blacklist on A.
    store().addToWatchlist(entry('shared'))
    await store().syncToCloud()
    await activate(a)
    assert.deepEqual(store().watchlist.map(item=>item.movieId).sort(),['offline-B','shared'])
    const before = (await api.getCloudWatchlist()).data.revision
    await store().syncToCloud()
    assert.equal((await api.getCloudWatchlist()).data.revision,before,'clean synchronization must not replace cloud collections')
    console.log('PASS two persisted mobile libraries: remote deletion, offline addition, history clear, restart, re-add and no-op uploads over HTTPS')
  } finally {
    await useAuthStore.getState().logout()
  }
}
