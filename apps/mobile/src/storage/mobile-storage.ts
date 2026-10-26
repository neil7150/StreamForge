import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { setStorageAdapter, disableAccountsForLocalUse, usePlaybackSettingsStore, useUserDataStore } from '@streamforge/core/stores'
import { HydratedStorage } from './hydrated-storage'

import { createMobileBacking, createMobileAdapter, SETTINGS_KEY } from './mobile-backing'
disableAccountsForLocalUse()
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
    const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith('streamforge.library.v1.guest.'))
    await mirror.hydrate([...new Set([...keys, SETTINGS_KEY])])
    setStorageAdapter(createMobileAdapter(mirror, () => null))
    usePlaybackSettingsStore.getState().hydrate()
    useUserDataStore.getState()._loadFromStorage()
  })().catch(error => { initialization = null; throw error })
  return initialization
}

export async function flushMobileStorage() {
  await mirror.flush()
  errorHandler(null)
}
