import type { AsyncKeyStorage } from './hydrated-storage'
import { scopeLibraryKey, type HydratedStorage } from './hydrated-storage'

export const SETTINGS_KEY = 'streamforge.playbackSettings.v1'
export const CREDENTIAL_KEYS = ['streamforge_access_token', 'streamforge_refresh_token', 'streamforge_user']
export const SESSION_RECORD_KEY = 'streamforge_auth_session_v1'
const SECRET_SETTINGS_KEY = 'streamforge_playback_secrets'

/** Platform adapters are injected so credential routing can be tested without Android. */
export function createMobileBacking(publicStorage: AsyncKeyStorage, secure: AsyncKeyStorage): AsyncKeyStorage {
  return {
    async getItem(key) {
      if (CREDENTIAL_KEYS.includes(key) || key === SESSION_RECORD_KEY) return secure.getItem(key)
      const value = await publicStorage.getItem(key)
      if (key !== SETTINGS_KEY || !value) return value
      const secretsJSON = await secure.getItem(SECRET_SETTINGS_KEY)
      try { return JSON.stringify({ ...JSON.parse(value), ...JSON.parse(secretsJSON || '{}') }) }
      catch { return null }
    },
    async setItem(key, value) {
      if (CREDENTIAL_KEYS.includes(key) || key === SESSION_RECORD_KEY) { await secure.setItem(key, value); return }
      if (key === SETTINGS_KEY) {
        const { openSubtitlesApiKey = '', torznabEndpoints = [], ...publicSettings } = JSON.parse(value)
        await secure.setItem(SECRET_SETTINGS_KEY, JSON.stringify({ openSubtitlesApiKey, torznabEndpoints }))
        await publicStorage.setItem(key, JSON.stringify(publicSettings))
        return
      }
      await publicStorage.setItem(key, value)
    },
    async removeItem(key) {
      if (CREDENTIAL_KEYS.includes(key) || key === SESSION_RECORD_KEY) { await secure.removeItem(key); return }
      if (key === SETTINGS_KEY) await secure.removeItem(SECRET_SETTINGS_KEY)
      await publicStorage.removeItem(key)
    }
  }
}

export function createMobileAdapter(mirror: HydratedStorage, account: () => string | null) {
  const readSession = (): Record<string, string> => {
    try { return JSON.parse(mirror.getItem(SESSION_RECORD_KEY) || '{}') || {} } catch { return {} }
  }
  const adapter = {
    getItem(key: string): string | null {
      if (CREDENTIAL_KEYS.includes(key)) { const value = readSession()[key]; return typeof value === 'string' ? value : null }
      return mirror.getItem(scopeLibraryKey(key, account()))
    },
    setItem(key: string, value: string) {
      if (CREDENTIAL_KEYS.includes(key)) mirror.setItem(SESSION_RECORD_KEY, JSON.stringify({ ...readSession(), [key]: value }))
      else mirror.setItem(scopeLibraryKey(key, account()), value)
    },
    removeItem(key: string) {
      if (CREDENTIAL_KEYS.includes(key)) { const session = readSession(); delete session[key]; mirror.setItem(SESSION_RECORD_KEY, JSON.stringify(session)) }
      else mirror.removeItem(scopeLibraryKey(key, account()))
    },
    setItems(entries: ReadonlyArray<readonly [string, string]>) {
      const credentials = entries.filter(([key]) => CREDENTIAL_KEYS.includes(key))
      if (credentials.length) mirror.setItem(SESSION_RECORD_KEY, JSON.stringify({ ...readSession(), ...Object.fromEntries(credentials) }))
      for (const [key, value] of entries) if (!CREDENTIAL_KEYS.includes(key)) adapter.setItem(key, value)
    },
    removeItems(keys: string[]) {
      if (CREDENTIAL_KEYS.every(key => keys.includes(key))) mirror.removeItem(SESSION_RECORD_KEY)
      else for (const key of keys.filter(key => CREDENTIAL_KEYS.includes(key))) adapter.removeItem(key)
      for (const key of keys) if (!CREDENTIAL_KEYS.includes(key)) adapter.removeItem(key)
    }
  }
  return adapter
}
