import test from 'node:test'
import assert from 'node:assert/strict'
import { createMobileCatalog, tvmazeSeriesId } from '../src/data/mobile-catalog.ts'
import { CinemetaMovieClient } from '../../../packages/core/src/clients/movie-catalog-client.ts'
import { TVMazeClient } from '../../../packages/core/src/clients/tvmaze-client.ts'

const movie = {id:'cinemeta:tt12345',title:'Example',year:2020,posterUrl:null,rating:7,genres:['Drama'],language:null,imdbId:'tt12345'}
const movies = {getPopularMovies:async()=>[movie],searchMovies:async()=>[movie],getMovie:async()=>({...movie,summary:'Summary',runtimeMinutes:90,backdropUrl:null,contentRating:null,ytsUrl:null})}
const show = {id:123,title:'Series',posterUrl:null,year:2020,status:null,network:null,type:null,language:null,genres:['Comedy'],rating:8,summary:null,tvmazeUrl:null,imdbId:null}
const shows = {getPopularSeries:async()=>[show],searchSeries:async()=>[show]}

test('direct catalog preserves provider identities, finite pagination and detail metadata',async()=>{
  const catalog=createMobileCatalog(movies,shows)
  assert.equal((await catalog.getMovies(1)).data[0].slug,'cinemeta:tt12345')
  assert.deepEqual((await catalog.getMovies(2)).data,[])
  assert.deepEqual((await catalog.getShows(1,24,'drama')).data,[])
  assert.equal((await catalog.getShows()).data[0].id,123)
  assert.equal((await catalog.getMovieBySlug('cinemeta:tt12345')).data.overview,'Summary')
  await assert.rejects(catalog.getMovieBySlug('old-backend-slug'),/older catalog/)
  assert.equal(tvmazeSeriesId(undefined,'tvmaze:123'),123)
  assert.equal(tvmazeSeriesId(undefined,'old-backend-slug'),null)
  assert.equal(tvmazeSeriesId(-1,'tvmaze:123'),null)
})

test('one unavailable provider yields explicitly partial search, both unavailable yield an error',async()=>{
  const failure=async()=>{throw new Error('offline')}
  const partial=createMobileCatalog({...movies,searchMovies:failure},shows)
  const response=await partial.search('Series')
  assert.equal(response.data[0].type,'show')
  assert.match(response.warning!,/incomplete/)
  await assert.rejects(createMobileCatalog({...movies,searchMovies:failure},{...shows,searchSeries:failure}).search('offline'),/unavailable/)
  const controller=new AbortController()
  controller.abort()
  await assert.rejects(partial.search('Series','all',1,controller.signal),/cancelled/)
})

test('direct metadata caches evict old queries instead of retaining an unbounded search history',async()=>{
  let movieRequests=0,showRequests=0
  const movieClient=new CinemetaMovieClient({fetchImpl:async()=>{movieRequests++;return new Response(JSON.stringify({metas:[]}))}})
  const showClient=new TVMazeClient({fetchImpl:async()=>{showRequests++;return new Response('[]')}})
  await movieClient.searchMovies('old query');await showClient.searchSeries('old query')
  for(let index=0;index<105;index++){await movieClient.searchMovies(`q${index}`);await showClient.searchSeries(`q${index}`)}
  const before=[movieRequests,showRequests]
  await movieClient.searchMovies('old query');await showClient.searchSeries('old query')
  assert.equal(movieRequests,before[0]+1)
  assert.equal(showRequests,before[1]+1)
})

test('TVmaze details, seasons and episode numbering work without our content service',async()=>{
  const paths:string[]=[]
  const client=new TVMazeClient({fetchImpl:async(input)=>{
    const path=new URL(String(input)).pathname
    paths.push(path)
    const value=path==='/shows/123' ? {id:123,name:'Series',genres:[]} : path==='/shows/123/seasons'
      ? [{id:456,number:1,name:'Season 1'}] : [{id:789,name:'First episode',season:1,number:1}]
    return new Response(JSON.stringify(value))
  }})
  assert.equal((await client.getSeries(123)).title,'Series')
  const seasons=await client.getSeasons(123)
  const episodes=await client.getSeasonEpisodes(seasons[0].id)
  assert.equal(episodes[0].seasonNumber,1)
  assert.equal(episodes[0].episodeNumber,1)
  assert.deepEqual(paths,['/shows/123','/shows/123/seasons','/seasons/456/episodes'])
})
