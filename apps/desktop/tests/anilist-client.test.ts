import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAnimeSearchMetadata } from '../src/main/metadata/anilist-client.ts'

test('normalizes AniList aliases only when the requested title is verified', () => {
  const payload = { data: { Media: {
    episodes: 500,
    title: { english: 'Naruto: Shippuden', romaji: 'Naruto: Shippuuden', native: 'ナルト 疾風伝' },
    synonyms: ['Naruto Shippuden', 'Naruto: Shippuuden']
  } } }
  assert.deepEqual(normalizeAnimeSearchMetadata(payload, 'Naruto Shippuden'), {
    aliases: ['Naruto: Shippuden', 'Naruto: Shippuuden', 'ナルト 疾風伝'],
    episodeCount: 500
  })
  assert.equal(normalizeAnimeSearchMetadata(payload, 'Boruto'), null)
})
