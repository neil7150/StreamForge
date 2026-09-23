import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchJSONWithFailover, fetchTextWithFailover } from '../src/main/search/provider-endpoints.ts'

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

test('uses the primary provider endpoint when it is healthy', async () => {
  const requests: string[] = []
  const result = await fetchJSONWithFailover(['https://primary.test', 'https://mirror.test'], '/api', async (input) => {
    requests.push(String(input))
    return response({ source: 'primary' })
  })
  assert.deepEqual(result, { payload: { source: 'primary' }, endpoint: 'https://primary.test' })
  assert.deepEqual(requests, ['https://primary.test/api'])
})

test('uses a healthy mirror when the primary endpoint fails', async () => {
  const result = await fetchJSONWithFailover(['https://primary.test', 'https://mirror.test'], '/api', async (input) => {
    if (String(input).startsWith('https://primary.test')) throw new Error('DNS failure')
    return response({ source: 'mirror' })
  })
  assert.deepEqual(result, { payload: { source: 'mirror' }, endpoint: 'https://mirror.test' })
})

test('rejects provider HTTP errors and reports total failure', async () => {
  await assert.rejects(
    fetchJSONWithFailover(['https://primary.test', 'https://mirror.test'], '/api', async () => response({}, 503)),
    /primary\.test returned HTTP 503/
  )
})

test('fails over text feeds used by RSS providers', async () => {
  const result = await fetchTextWithFailover(['https://primary.test', 'https://mirror.test'], '/rss', async (input) => {
    if (String(input).startsWith('https://primary.test')) return new Response('', { status: 503 })
    return new Response('<rss></rss>', { status: 200 })
  })
  assert.equal(result.endpoint, 'https://mirror.test')
  assert.equal(result.text, '<rss></rss>')
})
