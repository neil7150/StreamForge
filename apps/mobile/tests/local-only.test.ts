import test from 'node:test'
import assert from 'node:assert/strict'
import { disableAccountsForLocalUse, useAuthStore } from '../../../packages/core/src/stores/authStore.ts'
import { setAccountsEnabled } from '../../../packages/core/src/stores/account-features.ts'
import { useUserDataStore } from '../../../packages/core/src/stores/userDataStore.ts'
import { setStorageAdapter } from '../../../packages/core/src/stores/storage-adapter.ts'
import { createMobileAdapter } from '../src/storage/mobile-backing.ts'
import { HydratedStorage, scopeLibraryKey } from '../src/storage/hydrated-storage.ts'

test('device-local mode ignores saved sessions and blocks auth/cloud work, including stale auth state', async t => {
  const previousFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = async () => { requests++; throw new Error('A local library must not contact the network') }
  t.after(() => { globalThis.fetch = previousFetch; setAccountsEnabled(true); useAuthStore.setState({ user: null, isAuthenticated: false }) })
  const disk = new Map<string,string>([
    ['streamforge_access_token', 'old-access'], ['streamforge_refresh_token', 'old-refresh'],
    ['streamforge_user', JSON.stringify({ id:'old-account', email:'old@example.com' })]
  ])
  let credentialReads = 0
  setStorageAdapter({ getItem:key => { if (key.includes('token') || key === 'streamforge_user') credentialReads++; return disk.get(key) ?? null }, setItem:(key,value) => {disk.set(key,value)}, removeItem:key => {disk.delete(key)} })
  disableAccountsForLocalUse()
  useAuthStore.getState().loadSession()
  await useAuthStore.getState().login('old@example.com','unused')
  await useAuthStore.getState().register('new@example.com','unused')
  await useAuthStore.getState().loginWithOAuth('google')
  assert.equal(await useAuthStore.getState().refreshAuth(),false)
  assert.equal(useAuthStore.getState().user,null)
  assert.equal(credentialReads,0)
  assert.equal(disk.get('streamforge_refresh_token'),'old-refresh')
  assert.throws(() => useAuthStore.getState().setSession('a','r',{id:'x',email:'x@example.com',role:'user',email_verified:true,is_active:true}), /not available/)
  useAuthStore.setState({isAuthenticated:true})
  useUserDataStore.getState()._loadFromStorage()
  useUserDataStore.getState().addToWatchlist({movieId:'cinemeta:tt12345',slug:'cinemeta:tt12345',title:'Local title',poster:'',year:2020,rating:0,magnetURI:''})
  await useUserDataStore.getState().syncToCloud()
  await useUserDataStore.getState().syncFromCloud()
  assert.equal(requests,0)
})

test('local library survives storage restart and never imports or overwrites an older account library', async t => {
  disableAccountsForLocalUse()
  t.after(() => {setAccountsEnabled(true); useAuthStore.setState({user:null,isAuthenticated:false})})
  const oldAccountKey = scopeLibraryKey('streamforge_library_v2','old-account')
  const disk = new Map<string,string>([[oldAccountKey,'private account record']])
  const backing = {getItem:async(key:string)=>disk.get(key)??null,setItem:async(key:string,value:string)=>{disk.set(key,value)},removeItem:async(key:string)=>{disk.delete(key)}}
  const first = new HydratedStorage(backing)
  await first.hydrate([])
  setStorageAdapter(createMobileAdapter(first,()=>null))
  useUserDataStore.getState()._loadFromStorage()
  assert.equal(useUserDataStore.getState().watchlist.length,0)
  useUserDataStore.getState().addToWatchlist({movieId:'cinemeta:tt12345',slug:'cinemeta:tt12345',title:'Local title',poster:'',year:2020,rating:0,magnetURI:''})
  useUserDataStore.getState().addToHistory({movieId:'hash',contentKey:'movie:cinemeta:tt12345',slug:'cinemeta:tt12345',title:'Local title',poster:'',progress:0.2,currentTime:20,duration:100,magnetURI:'magnet:?xt=urn:btih:0123456789012345678901234567890123456789'})
  await first.flush()
  const restarted = new HydratedStorage(backing)
  await restarted.hydrate([...disk.keys()].filter(key=>key.startsWith('streamforge.library.v1.guest.')))
  setStorageAdapter(createMobileAdapter(restarted,()=>null))
  useUserDataStore.getState()._loadFromStorage()
  assert.equal(useUserDataStore.getState().watchlist[0].title,'Local title')
  assert.equal(useUserDataStore.getState().history[0].currentTime,20)
  useUserDataStore.getState().clearHistory()
  useUserDataStore.getState().removeFromWatchlist('cinemeta:tt12345')
  await restarted.flush()
  assert.equal(disk.get(oldAccountKey),'private account record')
  useUserDataStore.getState()._loadFromStorage()
  assert.equal(useUserDataStore.getState().watchlist.length,0)
  assert.equal(useUserDataStore.getState().history.length,0)
})
