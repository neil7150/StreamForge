import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import * as Linking from 'expo-linking'
import { setTorrentAPI, useAuthStore, extractInfoHash } from '@streamforge/core'
import { mobileTorrentAPI } from './native/torrent-engine'
import { RootNavigator } from './navigation/RootNavigator'
import type { RootStackParamList } from './navigation/types'
import { colors } from './theme/colors'

export const navigationRef = createNavigationContainerRef<RootStackParamList>()

const prefix = Linking.createURL('/')

const linkingConfig = {
  prefixes: [prefix, 'streamforge://', 'magnet:'],
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
  useEffect(() => {
    // 1. Initialize mobile torrent streaming engine
    setTorrentAPI(mobileTorrentAPI)

    // 2. Load cached user session
    useAuthStore.getState().loadSession()

    // 3. Handle incoming magnet or stream links
    const handleUrl = (url: string | null) => {
      if (!url) return
      if (url.startsWith('magnet:')) {
        const infoHash = extractInfoHash(url)
        if (infoHash && navigationRef.isReady()) {
          navigationRef.navigate('Player', {
            infoHash,
            title: 'Torrent Stream'
          })
        }
      }
    }

    Linking.getInitialURL().then(handleUrl)
    const subscription = Linking.addEventListener('url', (event) => handleUrl(event.url))

    return () => {
      subscription.remove()
    }
  }, [])

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <NavigationContainer ref={navigationRef} linking={linkingConfig}>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
