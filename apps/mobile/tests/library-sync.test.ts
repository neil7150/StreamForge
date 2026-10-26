import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { api } from '../../../packages/core/src/clients/api.ts'
import { librarySnapshot } from '../../../packages/core/src/clients/library-contract.ts'
import { useAuthStore } from '../../../packages/core/src/stores/authStore.ts'
import { useUserDataStore } from '../../../packages/core/src/stores/userDataStore.ts'
import { setStorageAdapter } from '../../../packages/core/src/stores/storage-adapter.ts'

const fixture = JSON.parse(readFileSync(new URL('../../../contracts/library-snapshots.json', import.meta.url), 'utf8'))
const tick = () => new Promise<void>(resolve => setImmediate(resolve))
const user = { id: 'sync-account', email: 'sync@example.com', role: 'user', email_verified: true, is_active: true }
const local = { movieId: 'local', slug: 'local', title: 'Local title', poster: '', year: 2026, rating: 0, magnetURI: '' }

async function setup(t: any, failRead = false, restoredWatchlist: unknown[] = []) {
  const original = { read: api.getCloudWatchlist, history: api.getCloudHistory, write: api.syncWatchlist, writeHistory: api.syncHistory, logout: api.logout }
  const values = new Map<string,string>()
  if (restoredWatchlist.length) values.set('streamforge_watchlist', JSON.stringify(restoredWatchlist))
  setStorageAdapter({getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value)},removeItem:key=>{values.delete(key)}})
  api.getCloudWatchlist = async () => { if (failRead) throw new Error('offline');return structuredClone(fixture.watchlist) }
  api.getCloudHistory = async () => structuredClone(fixture.history)
  api.syncWatchlist = async (_items,revision) => ({data:{revision:revision+1}})
  api.syncHistory = async (_items,revision) => ({data:{revision:revision+1}})
  api.logout = async()=>({})
  t.after(async()=>{await useAuthStore.getState().logout();api.getCloudWatchlist=original.read;api.getCloudHistory=original.history;api.syncWatchlist=original.write;api.syncHistory=original.writeHistory;api.logout=original.logout})
  useAuthStore.getState().setSession('access','refresh',user)
  await tick()
  return values
}

test('the mobile parser accepts the same JSON contract verified by the Go HTTP handler',()=>{
  assert.equal(librarySnapshot(fixture.watchlist.data,'watchlist').items.length,1)
  assert.deepEqual(librarySnapshot(fixture.history.data,'history'),{items:[],revision:3})
  assert.throws(()=>librarySnapshot([],'watchlist'))
  assert.throws(()=>librarySnapshot({items:[],revision:-1},'watchlist'))
  assert.throws(()=>librarySnapshot({items:[{...fixture.watchlist.data.items[0],added_at:'invalid'}],revision:0},'watchlist'))
})

test('a failed initial cloud read prevents every replacement upload and exposes retry',async t=>{
  await setup(t,true);let writes=0
  api.syncWatchlist=async()=>{writes++;return {data:{revision:1}}}
  api.syncHistory=async()=>{writes++;return {data:{revision:1}}}
  await useUserDataStore.getState().syncToCloud()
  assert.equal(writes,0)
  assert.match(useUserDataStore.getState().syncError!,/saved on this device/)
})

test('uploads merge the initial cloud snapshot and preserve real timestamps and revisions',async t=>{
  await setup(t);useUserDataStore.getState().addToWatchlist(local)
  let received:any
  api.syncWatchlist=async(items,revision)=>{received={items,revision};return {data:{revision:revision+1}}}
  await useUserDataStore.getState().syncToCloud()
  assert.equal(received.revision,7)
  assert.deepEqual(received.items.map((item:any)=>item.content_key).sort(),['local','movie:fixture'])
  assert.equal(received.items.find((item:any)=>item.content_key==='movie:fixture').added_at,'2026-10-24T10:00:00.000Z')
  assert.equal(useUserDataStore.getState().syncError,null)
})

test('a revision conflict retains local data and retry reloads before writing',async t=>{
  await setup(t);useUserDataStore.getState().addToWatchlist(local)
  let calls=0
  api.syncWatchlist=async()=>{calls++;throw Object.assign(new Error('conflict'),{status:409})}
  await useUserDataStore.getState().syncToCloud()
  assert.equal(calls,1)
  assert.match(useUserDataStore.getState().syncError!,/changed/)
  const updated=structuredClone(fixture.watchlist);updated.data.revision=8
  updated.data.items.push({...updated.data.items[0],content_key:'new-on-server'})
  api.getCloudWatchlist=async()=>updated
  api.syncWatchlist=async(items,revision)=>{
    assert.equal(revision,8)
    assert.ok(items.some(item=>item.content_key==='new-on-server'))
    assert.ok(items.some(item=>item.content_key==='local'))
    return {data:{revision:9}}
  }
  await useUserDataStore.getState().syncToCloud()
  assert.equal(useUserDataStore.getState().syncError,null)
})

test('same-account uploads serialize and advance the revision; logout drops queued work',async t=>{
  await setup(t)
  useUserDataStore.getState().addToWatchlist(local)
  let finish!:()=>void;const revisions:number[]=[]
  api.syncWatchlist=async(_items,revision)=>{
    revisions.push(revision)
    if(revisions.length===1)await new Promise<void>(resolve=>{finish=resolve})
    return {data:{revision:revision+1}}
  }
  const first=useUserDataStore.getState().syncToCloud()
  const second=useUserDataStore.getState().syncToCloud()
  await tick();assert.deepEqual(revisions,[7]);useUserDataStore.getState().addToWatchlist({...local,movieId:'during-upload'});finish();await Promise.all([first,second])
  assert.deepEqual(revisions,[7,8])
  const queued=useUserDataStore.getState().syncToCloud()
  await useAuthStore.getState().logout();await queued
  assert.deepEqual(revisions,[7,8])
})

test('restored offline edits are uploaded after sign-in successfully reads the cloud',async t=>{
  await setup(t,false,[{...local,addedAt:Date.now()}])
  let uploaded=false
  api.syncWatchlist=async(items,revision)=>{
    uploaded=items.some(item=>item.content_key==='local')&&items.some(item=>item.content_key==='movie:fixture')
    return {data:{revision:revision+1}}
  }
  await new Promise(resolve=>setTimeout(resolve,2200))
  assert.equal(uploaded,true)
})

test('history is sorted by newest progress before the fifty-item bound is applied',async t=>{
  await setup(t)
  useUserDataStore.getState().addToHistory({movieId:'new-local',contentKey:'movie:new-local',slug:'new-local',title:'Newest local progress',poster:'',progress:0.5,currentTime:30,duration:60,magnetURI:''})
  api.getCloudHistory=async()=>({data:{revision:4,items:Array.from({length:50},(_,index)=>({content_key:`movie:old-${index}`,title:`Older ${index}`,watched_at:'2020-01-01T00:00:00Z',progress:0.1,metadata:{}}))}})
  await useUserDataStore.getState().syncFromCloud()
  assert.equal(useUserDataStore.getState().history.length,50)
  assert.equal(useUserDataStore.getState().history[0].contentKey,'movie:new-local')
})

test('cloud deletion removes an unchanged persisted copy, including an empty cloud, without uploading it again', async t => {
  await setup(t)
  assert.equal(useUserDataStore.getState().watchlist.length, 1)
  useUserDataStore.getState()._loadFromStorage()
  api.getCloudWatchlist = async () => ({data:{items:[],revision:8}})
  let writes = 0
  api.syncWatchlist = async () => { writes++; return {data:{revision:9}} }
  api.syncHistory = async () => { writes++; return {data:{revision:4}} }
  await useUserDataStore.getState().syncFromCloud()
  await useUserDataStore.getState().syncToCloud()
  assert.deepEqual(useUserDataStore.getState().watchlist, [])
  assert.equal(writes, 0)
})

test('offline additions survive alongside remote deletions after a storage reload', async t => {
  await setup(t)
  useUserDataStore.getState().addToWatchlist(local)
  useUserDataStore.getState()._loadFromStorage()
  api.getCloudWatchlist = async () => ({data:{items:[],revision:8}})
  let uploaded: string[] = []
  api.syncWatchlist = async (items, revision) => { uploaded = items.map(item => item.content_key); return {data:{revision:revision+1}} }
  await useUserDataStore.getState().syncToCloud()
  assert.deepEqual(uploaded, ['local'])
})

test('a removal during an upload survives acknowledgment and restart', async t => {
  await setup(t)
  useUserDataStore.getState().addToWatchlist(local)
  let complete!: () => void
  let remote = structuredClone(fixture.watchlist)
  api.getCloudWatchlist = async () => structuredClone(remote)
  api.syncWatchlist = async (items, revision) => {
    await new Promise<void>(resolve => { complete = resolve })
    remote = {data:{items,revision:revision+1}}
    return {data:{revision:revision+1}}
  }
  const upload = useUserDataStore.getState().syncToCloud()
  await tick()
  useUserDataStore.getState().removeFromWatchlist('local')
  complete(); await upload
  useUserDataStore.getState()._loadFromStorage()
  api.syncWatchlist = async (items, revision) => {
    assert.ok(!items.some(item => item.content_key === 'local'))
    remote = {data:{items,revision:revision+1}}
    return {data:{revision:revision+1}}
  }
  await useUserDataStore.getState().syncToCloud()
  assert.ok(!remote.data.items.some((item: any) => item.content_key === 'local'))
})

test('acknowledged deletes do not hide a later explicit re-add from another device', async t => {
  await setup(t)
  useUserDataStore.getState().removeFromWatchlist('movie:fixture')
  await useUserDataStore.getState().syncToCloud()
  useUserDataStore.getState()._loadFromStorage()
  const readded = structuredClone(fixture.watchlist)
  readded.data.revision = 9
  api.getCloudWatchlist = async () => readded
  await useUserDataStore.getState().syncFromCloud()
  assert.equal(useUserDataStore.getState().watchlist[0].movieId, 'movie:fixture')
})

test('a partial upload acknowledges only the successful collection and preserves pending history', async t => {
  await setup(t)
  useUserDataStore.getState().addToWatchlist(local)
  useUserDataStore.getState().addToHistory({movieId:'history',title:'History',slug:'history',poster:'',progress:0.5,magnetURI:''})
  api.syncHistory = async () => { throw new Error('offline after watchlist upload') }
  await useUserDataStore.getState().syncToCloud()
  useUserDataStore.getState()._loadFromStorage()
  // Another device has now removed every acknowledged watchlist item.
  api.getCloudWatchlist = async () => ({data:{items:[],revision:9}})
  let watchlistWrites = 0; let historyWrites = 0
  api.syncWatchlist = async () => { watchlistWrites++; return {data:{revision:10}} }
  api.syncHistory = async (items, revision) => { historyWrites++; assert.equal(items[0].content_key,'history'); return {data:{revision:revision+1}} }
  await useUserDataStore.getState().syncToCloud()
  assert.equal(watchlistWrites,0); assert.equal(historyWrites,1)
  assert.deepEqual(useUserDataStore.getState().watchlist,[])
})

test('corrupt combined storage is preserved and blocks cloud writes', async t => {
  const values = await setup(t)
  values.set('streamforge_library_v2', '{broken')
  useUserDataStore.getState()._loadFromStorage()
  let writes = 0
  api.syncWatchlist = async () => { writes++; return {data:{revision:8}} }
  await useUserDataStore.getState().syncToCloud()
  useUserDataStore.getState().addToWatchlist(local)
  assert.equal(writes,0)
  assert.equal(values.get('streamforge_library_v2'),'{broken')
  assert.match(useUserDataStore.getState().syncError!,/could not be read/)
})
