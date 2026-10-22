import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, AppState } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import * as Linking from 'expo-linking'
import { setTorrentAPI, useAuthStore, extractInfoHash, api } from '@streamforge/core'
import { mobileTorrentAPI } from './native/torrent-engine'
import { resolveMobileBackend } from './config/backend'
import { RootNavigator } from './navigation/RootNavigator'
import type { RootStackParamList } from './navigation/types'
import { colors } from './theme/colors'
import { initializeMobileStorage, flushMobileStorage, onStorageError } from './storage/mobile-storage'

export const navigationRef = createNavigationContainerRef<RootStackParamList>()

const prefix = Linking.createURL('/')

// Expo statically replaces this exact property access in the JS bundle.
api.setBaseURL(resolveMobileBackend(process.env.EXPO_PUBLIC_API_BASE_URL))

const linkingConfig = {
  prefixes: [prefix, 'streamforge://'],
  config: {
    screens: {
      Main: {
        screens: {
          Home: 'home',
          Browse: 'browse',
          Search: 'search',
          Library: 'library',
          Settings: 'settings'
        }
      },
      MovieDetail: 'movie/:slug',
      SeriesDetail: 'series/:slug',
      Player: 'player',
      Login: 'login'
    }
  }
}

export default function App() {
  const pendingMagnetRef = useRef<string | null>(null)
  const [storageReady, setStorageReady] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const loadStorage = useCallback(() => {
    setStorageError(null)
    void initializeMobileStorage().then(() => setStorageReady(true)).catch(() => {
      setStorageError('Saved data could not be loaded. Retry to continue.')
    })
  }, [])

  useEffect(() => {
    onStorageError(setStorageError)
    loadStorage()
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') void flushMobileStorage().catch(() => {})
    })
    return () => { listener.remove(); onStorageError(() => {}) }
  }, [loadStorage])

  const openMagnet = useCallback((url: string) => {
    const infoHash = extractInfoHash(url)
    if (!infoHash) return
    if (!navigationRef.isReady()) {
      pendingMagnetRef.current = url
      return
    }
    pendingMagnetRef.current = null
    navigationRef.navigate('Player', {
      infoHash,
      title: 'Torrent Stream',
      magnetURI: url
    })
  }, [])

  useEffect(() => {
    // 1. Initialize mobile torrent streaming engine
    setTorrentAPI(mobileTorrentAPI)

    // 3. Handle incoming magnet or stream links
    const handleUrl = (url: string | null) => {
      if (!url) return
      if (url.startsWith('magnet:')) {
        openMagnet(url)
      }
    }

    Linking.getInitialURL().then(handleUrl)
    const subscription = Linking.addEventListener('url', (event) => handleUrl(event.url))

    return () => {
      subscription.remove()
    }
  }, [openMagnet])

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      {!storageReady ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          {storageError ? <>
            <Text style={{ color: colors.foreground }}>{storageError}</Text>
            <TouchableOpacity onPress={loadStorage} style={{ padding: 16 }} accessibilityRole="button">
              <Text style={{ color: colors.primary }}>Retry</Text>
            </TouchableOpacity>
          </> : <ActivityIndicator color={colors.primary} />}
        </View>
      ) : <>
      {storageError ? <TouchableOpacity
        accessibilityRole="button"
        onPress={() => { void flushMobileStorage().catch(() => {}) }}
        style={{ padding: 16, backgroundColor: colors.card }}
      ><Text style={{ color: colors.destructive }}>{storageError} Tap to retry.</Text></TouchableOpacity> : null}
      <NavigationContainer
        ref={navigationRef}
        linking={linkingConfig}
        onReady={() => {
          if (pendingMagnetRef.current) openMagnet(pendingMagnetRef.current)
        }}
      >
        <RootNavigator />
      </NavigationContainer>
      </>}
    </SafeAreaProvider>
  )
}
