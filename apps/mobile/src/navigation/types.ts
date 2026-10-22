import type { NavigatorScreenParams } from '@react-navigation/native'

export type MainTabParamList = {
  Home: undefined
  Browse: { genre?: string } | undefined
  Search: { query?: string } | undefined
  Library: undefined
  Settings: undefined
}

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList>
  MovieDetail: { slug: string; id?: string }
  SeriesDetail: { slug: string; id?: string | number }
  Player: {
    infoHash: string
    contentKey?: string
    title: string
    posterUrl?: string | null
    streamURL?: string
    magnetURI?: string
    fileIndex?: number
    currentTime?: number
    duration?: number
    isSeries?: boolean
    seriesTitle?: string
    seasonNumber?: number
    episodeNumber?: number
  }
  Login: undefined
}
