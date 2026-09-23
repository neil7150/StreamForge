import { create } from 'zustand'

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
}

interface PlaybackSettingsState extends PlaybackSettings {
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
  stremioAddonUrls: []
}

function loadSettings(): PlaybackSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<PlaybackSettings> & {
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
    return { ...DEFAULT_PLAYBACK_SETTINGS, ...saved, torznabEndpoints }
  } catch {
    return DEFAULT_PLAYBACK_SETTINGS
  }
}

function persist(settings: PlaybackSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    if (settings.preferredAudioLanguage) {
      localStorage.setItem('streamforge.preferredAudioLanguage', settings.preferredAudioLanguage)
    } else {
      localStorage.removeItem('streamforge.preferredAudioLanguage')
    }
    if (settings.subtitleMode === 'always') localStorage.setItem('streamforge.playback.subtitlesEnabled', 'true')
    if (settings.subtitleMode === 'off') localStorage.setItem('streamforge.playback.subtitlesEnabled', 'false')
  } catch {
    // Playback remains usable when local storage is unavailable.
  }
}

export const usePlaybackSettingsStore = create<PlaybackSettingsState>((set) => ({
  ...loadSettings(),
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
      stremioAddonUrls: (partial.stremioAddonUrls ?? state.stremioAddonUrls).slice(0, 8)
    }
    persist(next)
    return next
  }),
  resetSettings: () => {
    persist(DEFAULT_PLAYBACK_SETTINGS)
    set(DEFAULT_PLAYBACK_SETTINGS)
  }
}))
