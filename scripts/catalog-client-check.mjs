import assert from 'node:assert/strict'
import { APIClient } from '../packages/core/src/clients/api.ts'

export async function checkCatalog(base, adminToken) {
  const api = new APIClient(base)
  const admin = new APIClient(base);admin.setToken(adminToken)
  const movies = await api.getMovies(1,1)
  assert.equal(movies.data.length,1);assert.equal(movies.meta.total,2);assert.equal(movies.meta.per_page,1)
  const next = await api.getMovies(2,1)
  assert.notEqual(movies.data[0].id,next.data[0].id,'pagination needs a stable tie-breaker')
  assert.deepEqual((await api.getMovies(99,20)).data,[])
  assert.equal((await api.getTrending(1)).data.length,1)
  assert.equal((await api.getRecent(1)).data.length,1)
  assert.ok((await api.getGenres()).data.some(genre=>genre.slug==='action'))
  assert.equal((await api.getMovies(1,20,'action')).data[0].slug,'orbit-test-movie')
  assert.deepEqual((await api.getMovies(1,20,'missing')).data,[])
  const movie = (await api.getMovieBySlug('orbit-test-movie')).data
  assert.equal(movie.magnet_links.length,1)
  assert.equal((await api.getMovieMagnets(movie.id)).data[0].info_hash,'a'.repeat(40))

  const shows = await api.getShows()
  assert.equal(shows.data.length,3,'ongoing, ended and cancelled series must be visible')
  assert.equal((await api.getShows(1,20,'action')).data.length,1)
  const show = (await api.getShowBySlug('orbit-test-series')).data
  assert.equal(show.seasons[0].episodes[0].episode_number,1)
  const seasons = (await api.request(`/api/v1/shows/${show.id}/seasons`)).data
  assert.equal(seasons[0].episodes.length,1)
  const episode = show.seasons[0].episodes[0]
  assert.equal((await api.getEpisodeMagnets(episode.id)).data[0].info_hash,'b'.repeat(40))
  assert.deepEqual((await api.getShows(99,20)).data,[])
  console.log('PASS catalog pagination, genres, movie sources, public series and season/episode detail')

  const all = await api.search('Orbit')
  assert.equal(all.meta.total,4);assert.equal(all.data.length,4)
  assert.equal((await api.search('Orbit','show')).data.length,3)
  assert.equal((await api.search('Orbit','movie')).data.length,1)
  assert.ok((await api.searchSuggest('Orbit')).data.some(item=>item.type==='show'))
  assert.deepEqual((await api.search('nothing-matches-9817')).data,[])
  assert.deepEqual((await api.searchSuggest('nothing-matches-9817')).data,[])
  const normalized = await api.request('/api/v1/search?q=Orbit&page=-1&per_page=999')
  assert.equal(normalized.meta.page,1);assert.equal(normalized.meta.per_page,20)
  const searchPage1 = await api.request('/api/v1/search?q=Orbit&per_page=1&page=1')
  const searchPage2 = await api.request('/api/v1/search?q=Orbit&per_page=1&page=2')
  assert.notEqual(searchPage1.data[0].id,searchPage2.data[0].id)
  await assert.rejects(api.search('   '),error=>error.status===400)
  console.log('PASS movie/series search, suggestions, empty arrays and normalized pagination')

  for (const path of [
    '/api/v1/movies/orbit-hidden-movie',
    '/api/v1/movies/11111111-1111-4111-8111-111111111113/magnets',
    '/api/v1/movies/11111111-1111-4111-8111-111111111113/subtitles',
    '/api/v1/shows/orbit-hidden-series',
    '/api/v1/shows/22222222-2222-4222-8222-222222222224/seasons',
    '/api/v1/episodes/44444444-4444-4444-8444-444444444442/magnets'
  ]) await assert.rejects(api.request(path),error=>error.status===404,`unpublished catalog path must be hidden: ${path}`)
  console.log('PASS unpublished titles, seasons and sources are hidden from public endpoints')

  await assert.rejects(api.createAdminShow({title:'Forbidden',language:'en',license_type:'public_domain'}),error=>error.status===401)
  const created = (await admin.createAdminShow({title:'Created Test Series',language:'en',license_type:'public_domain'})).data
  assert.equal((await api.getShowBySlug(created.slug)).data.title,created.title)
  const season = (await admin.createAdminSeason(created.id,{season_number:1,title:'First season'})).data
  // Warm details before mutation so stale cache failures are observable.
  assert.equal((await api.getShowBySlug(created.slug)).data.seasons[0].episodes.length,0)
  const createdEpisode = (await admin.createAdminEpisode({season_id:season.id,episode_number:1,title:'Created pilot',air_date:'2020-01-01'})).data
  const updated = (await api.getShowBySlug(created.slug)).data
  assert.equal(updated.season_count,1);assert.equal(updated.episode_count,1)
  assert.equal(updated.seasons[0].episodes[0].id,createdEpisode.id)
  await admin.addAdminEpisodeMagnet(createdEpisode.id,{magnet_uri:'magnet:?xt=urn:btih:'+'e'.repeat(40),quality:'720p',info_hash:'e'.repeat(40)})
  assert.equal((await api.getEpisodeMagnets(createdEpisode.id)).data.length,1)
  await assert.rejects(admin.createAdminEpisode({season_id:season.id,episode_number:2,title:'Bad date',air_date:'not-a-date'}),error=>error.status===400)
  await assert.rejects(admin.createAdminEpisode({season_id:season.id,episode_number:1,title:'Duplicate'}))
  await assert.rejects(admin.createAdminSeason(created.id,{season_number:1,title:'Duplicate'}))
  const concurrent = await Promise.all([2,3].map(number => admin.createAdminEpisode({season_id:season.id,episode_number:number,title:`Episode ${number}`})))
  assert.equal(concurrent.length,2)
  const afterConcurrent = (await api.getShowBySlug(created.slug)).data
  assert.equal(afterConcurrent.season_count,1);assert.equal(afterConcurrent.episode_count,3)
  assert.equal(afterConcurrent.seasons[0].episode_count,3)
  assert.equal(afterConcurrent.seasons[0].episodes.length,3)
  console.log('PASS protected series/season/episode creation, concurrent counters, failed-insert rollback and cache refresh')
}
