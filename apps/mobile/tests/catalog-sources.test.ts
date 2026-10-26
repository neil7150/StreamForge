import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogSources, episodeSources } from '../src/data/catalog-sources.ts'

const magnet = `magnet:?xt=urn:btih:${'a'.repeat(40)}`
const valid = { id: 'source-1', magnet_uri: magnet, quality: '720p', file_size_bytes: 1024, seed_count: 4 }
const signal = () => new AbortController().signal

test('catalog sources reject malformed magnets, deduplicate hashes and normalize metadata', () => {
  const sources = catalogSources([null, {magnet_uri: 'https://invalid.test'}, valid, {...valid,id:'duplicate'}], 'Pilot')
  assert.equal(sources.length, 1)
  assert.equal(sources[0].magnetURI, magnet)
  assert.equal(sources[0].provider, 'StreamForge')
  assert.equal(sources[0].name, 'Pilot [720p]')
  assert.equal(sources[0].size, '1.0 KB')
  assert.equal(sources[0].seeders, 4)
  assert.equal(catalogSources([{...valid,file_size_bytes:-1,seed_count:NaN}], 'Pilot')[0].sizeBytes, 0)
  assert.throws(() => catalogSources(null, 'Pilot'))
})

test('catalog episode sources avoid external searches when usable sources exist', async () => {
  let searched = false
  const sources = await episodeSources({catalogEpisodeId:'episode-uuid', title:'Pilot', signal:signal(),
    getMagnets: async (id, receivedSignal) => {
      assert.equal(id, 'episode-uuid'); assert.equal(receivedSignal.aborted, false)
      return {data:[valid]}
    }, search:async () => { searched = true; return {results:[]} }
  })
  assert.equal(sources.length, 1); assert.equal(searched, false)
})

test('empty catalog episodes and external series can fall back to provider search', async () => {
  for (const catalogEpisodeId of ['episode-uuid', undefined]) {
    let searched = 0; let catalogCalls = 0
    await episodeSources({catalogEpisodeId, title:'Pilot', signal:signal(),
      getMagnets:async () => { catalogCalls++; return {data:[]} },
      search:async () => { searched++; return {results:[]} }
    })
    assert.equal(searched, 1); assert.equal(catalogCalls, catalogEpisodeId ? 1 : 0)
  }
})

test('failed or malformed catalog responses stay visible as failures', async () => {
  for (const getMagnets of [async () => {throw new Error('offline')}, async () => ({data:null})]) {
    let searched = false
    await assert.rejects(episodeSources({catalogEpisodeId:'episode', title:'Pilot', signal:signal(), getMagnets,
      search:async () => {searched = true; return {results:[]}}
    }))
    assert.equal(searched, false)
  }
})

test('cancelled episode requests cannot start a fallback or return late sources', async () => {
  const controller = new AbortController(); let searched = false
  await assert.rejects(episodeSources({catalogEpisodeId:'episode', title:'Pilot', signal:controller.signal,
    getMagnets:async () => {controller.abort(); return {data:[]}},
    search:async () => {searched = true; return {results:[]}}
  }))
  assert.equal(searched, false)
  const external = new AbortController()
  await assert.rejects(episodeSources({title:'Pilot', signal:external.signal,
    getMagnets:async () => ({data:[]}),
    search:async () => {external.abort(); return {results:catalogSources([valid], 'Pilot')}}
  }))
})
