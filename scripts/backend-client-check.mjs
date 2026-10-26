// Invoked only by tests/backend against its temporary HTTPS gateway.
import assert from 'node:assert/strict'
import { APIClient } from '../packages/core/src/clients/api.ts'
import { librarySnapshot } from '../packages/core/src/clients/library-contract.ts'
import { checkLibraryDevices } from './library-device-check.mjs'
import { checkCatalog } from './catalog-client-check.mjs'

async function main() {
  const base = process.env.STREAMFORGE_TEST_API_URL
  if (!base || !/^https:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('A temporary loopback HTTPS gateway is required')
  const password = 'Controlled-fixture!287'
  const suffix = crypto.randomUUID()
  const client = new APIClient(base)
  let session
  let generation = 0
  let refreshes = 0
  client.configureAuthRefresh(async () => {
    refreshes++
    session = (await client.refresh(session.refresh_token)).data
    client.setToken(session.access_token)
    return true
  }, () => generation)
  const account = await client.register(`first-${suffix}@example.com`, password)
  assert.equal(typeof account.data.user.id, 'string')
  session = (await client.login(`first-${suffix}@example.com`, password)).data
  generation++;client.setToken(session.access_token)
  const other = new APIClient(base)
  const otherSession = (await other.register(`second-${suffix}@example.com`, password)).data
  other.setToken(otherSession.access_token)

  const first = librarySnapshot((await client.getCloudWatchlist()).data, 'watchlist')
  assert.deepEqual(first, { items: [], revision: 0 })
  const added = new Date(Date.now() - 60_000).toISOString()
  const items = ['one', 'two'].map(key => ({content_key:key,title:`Fixture ${key}`,poster_url:'',added_at:added,metadata:{slug:key,contentType:'movie'}}))
  assert.equal((await client.syncWatchlist(items, first.revision)).data.revision, 1)
  let saved = librarySnapshot((await client.getCloudWatchlist()).data, 'watchlist')
  assert.equal(saved.items.length, 2)
  assert.equal(new Set(saved.items.map(item => item.id)).size, 2)
  assert.ok(saved.items.every(item => item.id && item.id !== '00000000-0000-0000-0000-000000000000'))
  assert.ok(saved.items.every(item => Date.parse(item.added_at) === Date.parse(added)))
  assert.deepEqual(librarySnapshot((await other.getCloudWatchlist()).data,'watchlist'),{items:[],revision:0})
  assert.equal((await other.syncWatchlist([items[0]],0)).data.revision,1)
  const otherSaved=librarySnapshot((await other.getCloudWatchlist()).data,'watchlist')
  assert.notEqual(otherSaved.items[0].id,saved.items.find(item=>item.content_key==='one').id)

  const history = [{content_key:'episode:fixture:1:1',title:'Episode fixture',poster_url:'',watched_at:added,progress:0.25,current_time:90.5,duration:362,metadata:{contentType:'episode',seasonNumber:1,episodeNumber:1,magnetURI:'magnet:?xt=urn:btih:'+'a'.repeat(40),fileIndex:2}}]
  assert.equal((await client.syncHistory(history,0)).data.revision,1)
  const savedHistory = librarySnapshot((await client.getCloudHistory()).data,'history')
  assert.equal(savedHistory.items[0].current_time,90.5)
  assert.equal(savedHistory.items[0].progress,0.25)
  assert.equal(savedHistory.items[0].metadata.fileIndex,2)
  assert.equal(Date.parse(savedHistory.items[0].watched_at),Date.parse(added))
  console.log('PASS registration, login, IDs, timestamps, numeric history and account isolation over HTTPS')

  await assert.rejects(client.syncWatchlist([],0), error=>error.status===409)
  const concurrent=await Promise.allSettled([
    client.syncWatchlist([...items,{...items[0],content_key:'winner-A'}],1),
    client.syncWatchlist([...items,{...items[0],content_key:'winner-B'}],1)
  ])
  assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1)
  assert.equal(concurrent.filter(result=>result.status==='rejected'&&result.reason.status===409).length,1)
  saved=librarySnapshot((await client.getCloudWatchlist()).data,'watchlist')
  assert.equal(saved.revision,2);assert.equal(saved.items.length,3)
  await assert.rejects(client.syncWatchlist([{...items[0],content_key:'force-insert-failure'}],2),error=>error.status===500)
  const afterFailure=librarySnapshot((await client.getCloudWatchlist()).data,'watchlist')
  assert.equal(afterFailure.revision,2)
  assert.deepEqual(afterFailure.items,saved.items)
  await assert.rejects(client.request('/api/v1/sync/watchlist',{method:'PUT',body:{items:[]}}),error=>error.status===400)
  console.log('PASS concurrent stale-write rejection, real PostgreSQL rollback and unversioned-write rejection')

  // A fresh client/session downloads persisted data rather than reusing JS state.
  const restarted=new APIClient(base)
  const restartedSession=(await restarted.login(`first-${suffix}@example.com`,password)).data
  restarted.setToken(restartedSession.access_token)
  assert.equal(librarySnapshot((await restarted.getCloudWatchlist()).data,'watchlist').items.length,3)
  assert.equal((await client.syncWatchlist([],2)).data.revision,3)
  assert.equal(librarySnapshot((await client.getCloudWatchlist()).data,'watchlist').items.length,0)
  assert.equal(librarySnapshot((await client.getCloudHistory()).data,'history').revision,1)
  assert.equal(librarySnapshot((await other.getCloudWatchlist()).data,'watchlist').items.length,1)
  console.log('PASS restart/download, deliberate clearing and independent collection revisions')

  const oldRefresh=session.refresh_token
  const before=refreshes
  await new Promise(resolve=>setTimeout(resolve,2200))
  await Promise.all([client.getMe(),client.getCloudHistory()])
  assert.equal(refreshes,before+1)
  await assert.rejects(client.refresh(oldRefresh),error=>error.status===401)
  for (let round=0;round<3;round++) {
    const contended=session.refresh_token
    const rotations=await Promise.allSettled(Array.from({length:8},()=>client.refresh(contended)))
    const winners=rotations.filter(result=>result.status==='fulfilled')
    assert.equal(winners.length,1,'a refresh token must be consumed only once under contention')
    assert.equal(rotations.filter(result=>result.status==='rejected'&&result.reason.status===401).length,7)
    session=winners[0].value.data
    client.setToken(session.access_token)
  }
  await fetch(`${base}/__integration__/redis?mode=down`,{method:'POST'})
  try {
    await assert.rejects(client.refresh(session.refresh_token),error=>error.status===500)
    await assert.rejects(client.getMe(),error=>error.status===503)
  } finally { await fetch(`${base}/__integration__/redis?mode=up`,{method:'POST'}) }
  session=(await client.refresh(session.refresh_token)).data
  client.setToken(session.access_token)
  console.log('PASS token-store outages remain service errors and recover without invalidating the saved refresh token')
  await fetch(`${base}/__integration__/redis?mode=oom`,{method:'POST'})
  try {
    await assert.rejects(client.login(`first-${suffix}@example.com`,password),error=>error.status===500)
  } finally { await fetch(`${base}/__integration__/redis?mode=up`,{method:'POST'}) }
  await fetch(`${base}/__integration__/redis?mode=revoke-error`,{method:'POST'})
  try {
    await assert.rejects(client.logout(session.refresh_token),error=>error.status===500)
  } finally { await fetch(`${base}/__integration__/redis?mode=up`,{method:'POST'}) }
  await client.getMe()
  await fetch(`${base}/__integration__/redis?mode=oom`,{method:'POST'})
  try {
    await assert.rejects(client.logout(session.refresh_token),error=>error.status===500)
  } finally { await fetch(`${base}/__integration__/redis?mode=up`,{method:'POST'}) }
  console.log('PASS Redis OOM login/blacklist writes and refresh revocation failures never report successful login/logout')
  const revokedAccess=session.access_token
  const revokedRefresh=session.refresh_token
  await client.logout(revokedRefresh)
  generation++;client.setToken(null)
  await assert.rejects(client.request('/auth/me',{token:revokedAccess}),error=>error.status===401)
  await assert.rejects(client.refresh(revokedRefresh),error=>error.status===401)
  console.log('PASS concurrent expiry renewal, single-use refresh rotation, logout revocation and JWT blacklist')
  await checkCatalog(base,process.env.STREAMFORGE_TEST_ADMIN_TOKEN)
  await checkLibraryDevices(base)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
