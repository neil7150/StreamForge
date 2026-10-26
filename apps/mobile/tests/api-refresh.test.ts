import test from 'node:test'
import assert from 'node:assert/strict'
import { APIClient } from '../../../packages/core/src/clients/api.ts'

const json = (status: number, data: unknown = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const tick = () => new Promise<void>(resolve => setImmediate(resolve))

test('concurrent expired requests share renewal and replay once with the new token', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  const client = new APIClient('https://fixture.invalid'); client.setToken('expired')
  let refreshes = 0
  let complete!: (ok: boolean) => void
  client.configureAuthRefresh(() => { refreshes++; return new Promise(resolve => { complete = resolve }) }, () => 'account-A')
  const tokens: string[] = []
  globalThis.fetch = async (_url, options) => {
    const token = (options?.headers as Record<string, string>).Authorization
    tokens.push(token)
    return token === 'Bearer expired' ? json(401) : json(200, { data: 'ok' })
  }
  const one = client.getProfile(); const two = client.getProfile()
  await tick()
  assert.equal(refreshes, 1)
  client.setToken('renewed'); complete(true)
  await Promise.all([one, two])
  assert.deepEqual(tokens, ['Bearer expired', 'Bearer expired', 'Bearer renewed', 'Bearer renewed'])
})

test('a request for an old account is never replayed under a replacement login', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original })
  const client = new APIClient('https://fixture.invalid');client.setToken('A')
  let identity = 'A'; let complete!: (ok: boolean) => void; let requests = 0
  client.configureAuthRefresh(() => new Promise(resolve => { complete = resolve }), () => identity)
  globalThis.fetch = async () => { requests++; return json(401) }
  const request = client.updateProfile({ display_name: 'Private A' })
  const rejected = assert.rejects(request, (error: any) => error.status === 401)
  await tick(); identity = 'B';client.setToken('B');complete(true)
  await rejected
  assert.equal(requests, 1)
})

test('login errors are not refreshed and a failed retried request cannot loop', async t => {
  const original = globalThis.fetch;t.after(() => { globalThis.fetch = original })
  const client = new APIClient('https://fixture.invalid');client.setToken('old')
  let refreshes = 0;let requests = 0
  client.configureAuthRefresh(async () => { refreshes++;client.setToken('new');return true }, () => 'A')
  globalThis.fetch = async () => { requests++;return json(401) }
  await assert.rejects(client.login('test@example.com', 'invalid'))
  assert.equal(refreshes, 0)
  await assert.rejects(client.getProfile())
  assert.equal(refreshes, 1)
  assert.equal(requests, 3)
})

test('aborting during renewal prevents replay', async t => {
  const original = globalThis.fetch;t.after(() => { globalThis.fetch = original })
  const client = new APIClient('https://fixture.invalid');client.setToken('old')
  let complete!: (ok: boolean) => void;let requests = 0
  client.configureAuthRefresh(() => new Promise(resolve => {complete=resolve}),()=> 'A')
  globalThis.fetch=async()=>{requests++;return json(401)}
  const controller=new AbortController()
  const request=client.request('/api/v1/profile',{signal:controller.signal})
  const rejected=assert.rejects(request)
  await tick();controller.abort();client.setToken('new');complete(true)
  await rejected;assert.equal(requests,1)
})
