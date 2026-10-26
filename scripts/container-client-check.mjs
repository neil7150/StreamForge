import assert from 'node:assert/strict'
import { APIClient } from '../packages/core/src/clients/api.ts'
const base = process.env.STREAMFORGE_TEST_API_URL
if (!/^https:\/\/127\.0\.0\.1:\d+$/.test(base || '')) throw new Error('An isolated loopback container gateway is required.')
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('TLS verification must stay enabled.')
const client = new APIClient(base)
let session = (await client.register(`container-${crypto.randomUUID()}@example.com`,'Controlled-container!287')).data
client.setToken(session.access_token)
const initial = (await client.getCloudWatchlist()).data
const item = {content_key:'container:fixture',title:'Container fixture',poster_url:'',added_at:new Date(Date.now()-1000).toISOString(),metadata:{slug:'container-fixture'}}
await client.syncWatchlist([item],initial.revision)
const saved = (await client.getCloudWatchlist()).data
assert.equal(saved.items[0].content_key,item.content_key)
await assert.rejects(client.syncWatchlist([],initial.revision),error=>error.status===409)
const history = (await client.getCloudHistory()).data
await client.syncHistory([{content_key:'container:history',title:'History fixture',watched_at:new Date().toISOString(),progress:0.25,current_time:25,duration:100,metadata:{}}],history.revision)
const catalog = await Promise.all([client.getMovies(1,1),client.getShows(1,1),client.search('Orbit')])
for (const result of catalog) assert.ok(Array.isArray(result.data))
// Six auth requests total, within the real gateway's configured initial burst.
const rotated = await Promise.allSettled([client.refresh(session.refresh_token),client.refresh(session.refresh_token)])
const successes = rotated.filter(result=>result.status==='fulfilled')
assert.equal(successes.length,1)
assert.ok(rotated.some(result=>result.status==='rejected' && result.reason.status===401))
session = successes[0].value.data
client.setToken(session.access_token)
await client.logout(session.refresh_token)
await assert.rejects(client.getMe(),error=>error.status===401)
await assert.rejects(client.refresh(session.refresh_token),error=>error.status===401)
console.log('PASS real gateway TLS, PostgreSQL sync/CAS, catalog routing, Redis single-use rotation and logout revocation.')
