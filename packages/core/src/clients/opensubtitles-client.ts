type UnknownRecord = Record<string, unknown>

import type { OnlineSubtitleSearchRequest, OnlineSubtitleResult } from '../types/torrent'

const API_URL = 'https://api.opensubtitles.com/api/v1'

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? value as UnknownRecord : null
}

function requireApiKey(value: string): string {
  const key = String(value || '').trim()
  if (key.length < 8 || key.length > 256) throw new Error('A valid OpenSubtitles API key is required.')
  return key
}

function headers(apiKey: string): Record<string, string> {
  return {
    'Api-Key': requireApiKey(apiKey),
    'User-Agent': 'StreamForge v0.1',
    Accept: 'application/json'
  }
}

export async function searchOnlineSubtitles(request: OnlineSubtitleSearchRequest): Promise<OnlineSubtitleResult[]> {
  const query = String(request.query || '').trim().slice(0, 160)
  if (!query) throw new Error('A title is required for subtitle search.')
  const params = new URLSearchParams({ query, order_by: 'download_count', order_direction: 'desc' })
  if (request.language?.trim()) params.set('languages', request.language.trim().toLowerCase().slice(0, 3))
  if (Number.isSafeInteger(request.seasonNumber)) params.set('season_number', String(request.seasonNumber))
  if (Number.isSafeInteger(request.episodeNumber)) params.set('episode_number', String(request.episodeNumber))
  const response = await fetch(`${API_URL}/subtitles?${params}`, {
    headers: headers(request.apiKey),
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw new Error(`OpenSubtitles search failed (${response.status}).`)
  const payload = record(await response.json())
  const data = Array.isArray(payload?.data) ? payload.data : []
  return data.slice(0, 20).flatMap((item) => {
    const root = record(item)
    const attributes = record(root?.attributes)
    const files = Array.isArray(attributes?.files) ? attributes.files : []
    const file = record(files[0])
    const fileId = Number(file?.file_id)
    const fileName = typeof file?.file_name === 'string' ? file.file_name : ''
    if (!Number.isSafeInteger(fileId) || fileId <= 0 || !fileName) return []
    return [{
      id: String(root?.id ?? fileId),
      fileId,
      fileName,
      language: typeof attributes?.language === 'string' ? attributes.language : 'und',
      release: typeof attributes?.release === 'string' ? attributes.release : null,
      downloadCount: Number(attributes?.download_count) || 0
    }]
  })
}

export async function downloadOnlineSubtitle(apiKey: string, fileId: number): Promise<string> {
  if (!Number.isSafeInteger(fileId) || fileId <= 0) throw new Error('Invalid subtitle file ID.')
  const response = await fetch(`${API_URL}/download`, {
    method: 'POST',
    headers: { ...headers(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw new Error(`OpenSubtitles download request failed (${response.status}).`)
  const payload = record(await response.json())
  const link = typeof payload?.link === 'string' ? payload.link : ''
  const url = new URL(link)
  if (url.protocol !== 'https:') throw new Error('OpenSubtitles returned an invalid download link.')
  const subtitle = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!subtitle.ok) throw new Error(`Subtitle download failed (${subtitle.status}).`)
  const contentLength = Number(subtitle.headers.get('content-length')) || 0
  if (contentLength > 5 * 1024 * 1024) throw new Error('Subtitle file is too large.')
  const content = await subtitle.text()
  if (content.length > 5 * 1024 * 1024) throw new Error('Subtitle file is too large.')
  return content
}

export const openSubtitlesClient = {
  searchOnlineSubtitles,
  downloadOnlineSubtitle
}

