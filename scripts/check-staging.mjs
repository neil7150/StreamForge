// Read-only checks. Does not create accounts, modify collections or disable TLS verification.
import assert from 'node:assert/strict'
const value = process.env.STREAMFORGE_STAGING_URL
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('TLS certificate verification must remain enabled.')
if (!value) throw new Error('Set STREAMFORGE_STAGING_URL to the HTTPS gateway origin.')
const base = new URL(value)
if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('An HTTPS origin without credentials, path or query is required.')
async function check(path, expected, json = true) {
  const res = await fetch(new URL(path,base), {redirect:'error', signal:AbortSignal.timeout(15000)})
  assert.equal(res.status,expected,`${path}: unexpected HTTP status`)
  if (json) { assert.match(res.headers.get('content-type') || '', /application\/json/); return res.json() }
}
await check('/health',200,false)
for (const path of ['/api/v1/movies?per_page=1','/api/v1/shows?per_page=1','/api/v1/genres','/api/v1/search?q=stagingprobe&per_page=1']) {
  const result = await check(path,200)
  assert.ok(Array.isArray(result.data),`${path}: expected a data array`)
}
await check('/api/v1/sync/watchlist',401)
await check('/auth/me',401)
console.log('PASS public TLS, gateway routing, catalog/search response shapes and anonymous authentication rejection. Account mutations, Redis failure recovery and Android remain separate tests.')
