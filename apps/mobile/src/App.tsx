import React, { useCallback, useEffect, useRef } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import * as Linking from 'expo-linking'
import { setTorrentAPI, useAuthStore, extractInfoHash } from '@streamforge/core'
import { initializeMobileTorrentEngine, mobileTorrentAPI } from './native/torrent-engine'
import { RootNavigator } from './navigation/RootNavigator'
import type { RootStackParamList } from './navigation/types'
import { colors } from './theme/colors'

export const navigationRef = createNavigationContainerRef<RootStackParamList>()

const prefix = Linking.createURL('/')

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
    void initializeMobileTorrentEngine().catch((error) => {
      console.warn('Torrent daemon warm-up failed:', error)
    })

    // 2. Load cached user session
    useAuthStore.getState().loadSession()

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
      <NavigationContainer
        ref={navigationRef}
        linking={linkingConfig}
        onReady={() => {
          if (pendingMagnetRef.current) openMagnet(pendingMagnetRef.current)
        }}
      >
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
