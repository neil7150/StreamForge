import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { setStorageAdapter, useAuthStore, usePlaybackSettingsStore, useUserDataStore } from '@streamforge/core/stores'
import { HydratedStorage } from './hydrated-storage'

import { createMobileBacking, createMobileAdapter, SETTINGS_KEY, SESSION_RECORD_KEY } from './mobile-backing'
let account: string | null = null
let errorHandler: (message: string | null) => void = () => {}

export function onStorageError(handler: typeof errorHandler) { errorHandler = handler }

const mirror = new HydratedStorage(createMobileBacking(AsyncStorage, {
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: key => SecureStore.deleteItemAsync(key)
}), () => errorHandler('Changes have not been saved. Retry before closing the app.'))

let initialization: Promise<void> | null = null
export function initializeMobileStorage(): Promise<void> {
  if (!initialization) initialization = (async () => {
    const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith('streamforge.'))
    await mirror.hydrate([...new Set([...keys, SESSION_RECORD_KEY, SETTINGS_KEY])])
    setStorageAdapter(createMobileAdapter(mirror, () => account))
    usePlaybackSettingsStore.getState().hydrate()
    const updateAccount = () => {
      account = useAuthStore.getState().user?.id ?? null
      useUserDataStore.getState()._loadFromStorage()
    }
    useAuthStore.subscribe((state, previous) => {
      if (state.user?.id !== previous.user?.id) updateAccount()
    })
    useAuthStore.getState().loadSession()
    updateAccount()
  })().catch(error => { initialization = null; throw error })
  return initialization
}

export async function flushMobileStorage() {
  await mirror.flush()
  errorHandler(null)
}
