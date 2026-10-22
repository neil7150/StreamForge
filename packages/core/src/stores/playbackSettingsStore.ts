import { create } from 'zustand'
import { getStorageAdapter } from './storage-adapter'

export type PreferredQuality = 'auto' | '2160p' | '1080p' | '720p'
export type SubtitleMode = 'auto' | 'always' | 'off'

export interface TorznabEndpointSetting {
  url: string
  apiKey: string
}

export interface PlaybackSettings {
  preferredQuality: PreferredQuality
  preferDirectPlay: boolean
  minimumSeeders: number
  maxStreamSizeGb: number
  preferredAudioLanguage: string
  preferredSubtitleLanguage: string
  subtitleMode: SubtitleMode
  autoplayNextEpisode: boolean
  automaticSourceFallback: boolean
  smartDownloads: boolean
  smartDownloadCount: number
  skipChapterMarkers: boolean
  openSubtitlesApiKey: string
  torznabEnabled: boolean
  torznabEndpoints: TorznabEndpointSetting[]
  stremioAddonEnabled: boolean
  stremioAddonUrls: string[]
  torrentioEnabled: boolean
}

interface PlaybackSettingsState extends PlaybackSettings {
  hydrate: () => void
  updateSettings: (settings: Partial<PlaybackSettings>) => void
  resetSettings: () => void
}

const STORAGE_KEY = 'streamforge.playbackSettings.v1'

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  preferredQuality: 'auto',
  preferDirectPlay: true,
  minimumSeeders: 1,
  maxStreamSizeGb: 0,
  preferredAudioLanguage: '',
  preferredSubtitleLanguage: 'eng',
  subtitleMode: 'auto',
  autoplayNextEpisode: true,
  automaticSourceFallback: true,
  smartDownloads: false,
  smartDownloadCount: 1,
  skipChapterMarkers: true,
  openSubtitlesApiKey: '',
  torznabEnabled: false,
  torznabEndpoints: [],
  stremioAddonEnabled: false,
  stremioAddonUrls: [],
  torrentioEnabled: true
}

export function normalizePlaybackSettings(value: unknown): PlaybackSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const normalized = { ...DEFAULT_PLAYBACK_SETTINGS }
  for (const key of Object.keys(DEFAULT_PLAYBACK_SETTINGS) as (keyof PlaybackSettings)[]) {
    const baseline = DEFAULT_PLAYBACK_SETTINGS[key]
    const candidate = source[key]
    if (typeof baseline === 'boolean' && typeof candidate === 'boolean') (normalized as any)[key] = candidate
    if (typeof baseline === 'string' && typeof candidate === 'string') (normalized as any)[key] = candidate.slice(0, 2048)
    if (typeof baseline === 'number' && typeof candidate === 'number' && Number.isFinite(candidate)) (normalized as any)[key] = Math.max(0, candidate)
  }
  if (!['auto', '720p', '1080p', '2160p'].includes(normalized.preferredQuality)) normalized.preferredQuality = 'auto'
  if (!['auto', 'always', 'off'].includes(normalized.subtitleMode)) normalized.subtitleMode = 'auto'
  normalized.minimumSeeders = Math.min(10000, Math.round(normalized.minimumSeeders))
  normalized.smartDownloadCount = Math.min(5, Math.max(1, Math.round(normalized.smartDownloadCount)))
  normalized.torznabEndpoints = Array.isArray(source.torznabEndpoints) ? source.torznabEndpoints
    .filter((item: any) => item && typeof item.url === 'string').slice(0, 8)
    .map((item: any) => ({ url: item.url.slice(0, 2048), apiKey: typeof item.apiKey === 'string' ? item.apiKey.slice(0, 2048) : '' })) : []
  normalized.stremioAddonUrls = Array.isArray(source.stremioAddonUrls) ? source.stremioAddonUrls.filter((item): item is string => typeof item === 'string').slice(0, 8).map(item => item.slice(0, 2048)) : []
  return normalized
}

function loadSettings(): PlaybackSettings {
  try {
    const storage = getStorageAdapter()
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) || '{}') as Partial<PlaybackSettings> & {
      torznabUrl?: string
      torznabApiKey?: string
    }
    const savedEndpoints = Array.isArray(saved.torznabEndpoints)
      ? saved.torznabEndpoints.filter((endpoint) => endpoint && typeof endpoint.url === 'string').slice(0, 8).map((endpoint) => ({
        url: endpoint.url,
        apiKey: typeof endpoint.apiKey === 'string' ? endpoint.apiKey : ''
      }))
      : []
    const torznabEndpoints = savedEndpoints.length > 0
      ? savedEndpoints
      : (saved.torznabUrl ? [{ url: saved.torznabUrl, apiKey: saved.torznabApiKey || '' }] : [])
    return normalizePlaybackSettings({
      ...DEFAULT_PLAYBACK_SETTINGS,
      ...saved,
      torznabEndpoints,
      torrentioEnabled: saved.torrentioEnabled ?? DEFAULT_PLAYBACK_SETTINGS.torrentioEnabled
    })
  } catch {
    return DEFAULT_PLAYBACK_SETTINGS
  }
}

function persist(settings: PlaybackSettings): void {
  try {
    const storage = getStorageAdapter()
    storage.setItem(STORAGE_KEY, JSON.stringify(settings))
    if (settings.preferredAudioLanguage) {
      storage.setItem('streamforge.preferredAudioLanguage', settings.preferredAudioLanguage)
    } else {
      storage.removeItem('streamforge.preferredAudioLanguage')
    }
    if (settings.subtitleMode === 'always') storage.setItem('streamforge.playback.subtitlesEnabled', 'true')
    if (settings.subtitleMode === 'off') storage.setItem('streamforge.playback.subtitlesEnabled', 'false')
  } catch {
    // Playback remains usable when storage is unavailable.
  }
}

export const usePlaybackSettingsStore = create<PlaybackSettingsState>((set) => ({
  ...loadSettings(),
  hydrate: () => set(loadSettings()),
  updateSettings: (partial) => set((state) => {
    const next: PlaybackSettings = {
      preferredQuality: partial.preferredQuality ?? state.preferredQuality,
      preferDirectPlay: partial.preferDirectPlay ?? state.preferDirectPlay,
      minimumSeeders: Math.max(0, Math.round(partial.minimumSeeders ?? state.minimumSeeders)),
      maxStreamSizeGb: Math.max(0, partial.maxStreamSizeGb ?? state.maxStreamSizeGb),
      preferredAudioLanguage: partial.preferredAudioLanguage ?? state.preferredAudioLanguage,
      preferredSubtitleLanguage: partial.preferredSubtitleLanguage ?? state.preferredSubtitleLanguage,
      subtitleMode: partial.subtitleMode ?? state.subtitleMode,
      autoplayNextEpisode: partial.autoplayNextEpisode ?? state.autoplayNextEpisode,
      automaticSourceFallback: partial.automaticSourceFallback ?? state.automaticSourceFallback,
      smartDownloads: partial.smartDownloads ?? state.smartDownloads,
      smartDownloadCount: Math.min(5, Math.max(1, Math.round(partial.smartDownloadCount ?? state.smartDownloadCount))),
      skipChapterMarkers: partial.skipChapterMarkers ?? state.skipChapterMarkers,
      openSubtitlesApiKey: partial.openSubtitlesApiKey ?? state.openSubtitlesApiKey,
      torznabEnabled: partial.torznabEnabled ?? state.torznabEnabled,
      torznabEndpoints: (partial.torznabEndpoints ?? state.torznabEndpoints).slice(0, 8),
      stremioAddonEnabled: partial.stremioAddonEnabled ?? state.stremioAddonEnabled,
      stremioAddonUrls: (partial.stremioAddonUrls ?? state.stremioAddonUrls).slice(0, 8),
      torrentioEnabled: partial.torrentioEnabled ?? state.torrentioEnabled
    }
    persist(next)
    return next
  }),
  resetSettings: () => {
    persist(DEFAULT_PLAYBACK_SETTINGS)
    set(DEFAULT_PLAYBACK_SETTINGS)
  }
}))
