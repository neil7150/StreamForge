import assert from 'node:assert/strict'
import test from 'node:test'
import { preserveHistoryMetadata, type HistoryEntryDraft } from '../src/renderer/src/lib/history-policy.ts'

const existing: HistoryEntryDraft = {
  movieId: 'hash',
  slug: 'hash',
  title: 'Fight Club',
  poster: 'https://images.example/fight-club.jpg',
  progress: 0.2,
  magnetURI: 'magnet:?xt=urn:btih:old'
}

test('playback updates cannot erase saved titles, posters, or magnets', () => {
  const merged = preserveHistoryMetadata(existing, {
    movieId: 'hash',
    slug: '',
    title: '',
    poster: '',
    progress: 0.6,
    currentTime: 60,
    duration: 100,
    magnetURI: ''
  })
  assert.equal(merged.title, existing.title)
  assert.equal(merged.poster, existing.poster)
  assert.equal(merged.magnetURI, existing.magnetURI)
  assert.equal(merged.slug, existing.slug)
  assert.equal(merged.progress, 0.6)
})

test('new non-empty playback metadata replaces older display metadata', () => {
  const merged = preserveHistoryMetadata(existing, {
    ...existing,
    title: 'Fight Club — Remastered',
    poster: 'https://images.example/new.jpg',
    progress: 0.8
  })
  assert.equal(merged.title, 'Fight Club — Remastered')
  assert.equal(merged.poster, 'https://images.example/new.jpg')
})
