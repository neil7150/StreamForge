import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ImageBackground,
  StyleSheet,
  ActivityIndicator
} from 'react-native'
import { Play, Plus, Check } from 'lucide-react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { RootStackParamList, MainTabParamList } from '../navigation/types'
import { MediaCard } from '../components/ui/MediaCard'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme/colors'
import { mobileCatalog as catalog } from '../data/mobile-catalog'
import { useUserDataStore } from '@streamforge/core/stores'
import { formatResumeTime } from '@streamforge/core/policies'

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>

export const HomeScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets()
  const [trending, setTrending] = useState<any[]>([])
  const [recent, setRecent] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const history = useUserDataStore((s) => s.history)
  const watchlist = useUserDataStore((s) => s.watchlist)
  const addToWatchlist = useUserDataStore((s) => s.addToWatchlist)
  const removeFromWatchlist = useUserDataStore((s) => s.removeFromWatchlist)

  const loadContent = useCallback(async () => {
    setLoadError(null)
    try {
      const response = await catalog.getPopularMovies()
      setTrending(response.data.slice(0, 15))
      setRecent(response.data.slice(15, 30))
    } catch {
      setLoadError('Titles could not be loaded. Please try again.')
    } finally {
      setIsLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadContent()
  }, [loadContent])

  const onRefresh = () => {
    setRefreshing(true)
    loadContent()
  }

  const featured = trending[0]
  const isFeaturedInWatchlist = watchlist.some((w) => w.movieId === (featured?.id || featured?.slug))

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {loadError || (trending.length === 0 && recent.length === 0) ? (
        <View style={[styles.section, { padding: 16, paddingTop: insets.top + 16 }]}>
          <Text style={{ color: colors.textSecondary }}>{loadError || 'No titles available yet.'}</Text>
          <TouchableOpacity onPress={onRefresh} accessibilityRole="button" style={{ paddingVertical: 16 }}>
            <Text style={{ color: colors.primary }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {/* Hero Banner */}
      {featured ? (
        <View style={[styles.heroContainer, { height: 380 + insets.top }]}>
          <ImageBackground
            source={{ uri: featured.backdrop_url || featured.backdrop || featured.poster_url || featured.poster }}
            style={styles.heroImage}
            resizeMode="cover"
          >
            <View style={[styles.heroGradient, { paddingTop: insets.top + 20 }]}>
              <Text style={styles.heroBadge}>FEATURED</Text>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {featured.title}
              </Text>
              <Text style={styles.heroOverview} numberOfLines={2}>
                {featured.overview}
              </Text>
              <View style={styles.heroActions}>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => navigation.navigate('MovieDetail', { slug: featured.slug, id: featured.id })}
                >
                  <Play size={18} color="#ffffff" fill="#ffffff" />
                  <Text style={styles.primaryBtnText}>Details</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => {
                    const id = featured.id || featured.slug
                    if (isFeaturedInWatchlist) {
                      removeFromWatchlist(id)
                    } else {
                      addToWatchlist({
                        movieId: id,
                        slug: featured.slug,
                        title: featured.title,
                        poster: featured.poster_url || featured.poster || '',
                        year: featured.year || 0,
                        rating: featured.rating || 0,
                        magnetURI: featured.magnetURI || ''
                      })
                    }
                  }}
                >
                  {isFeaturedInWatchlist ? (
                    <Check size={18} color={colors.text} />
                  ) : (
                    <Plus size={18} color={colors.text} />
                  )}
                  <Text style={styles.secondaryBtnText}>
                    {isFeaturedInWatchlist ? 'In Watchlist' : 'Watchlist'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ImageBackground>
        </View>
      ) : null}

      {/* Continue Watching */}
      {history.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Continue Watching</Text>
          <FlatList
            data={history.slice(0, 10)}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item: any) => item.contentKey || item.movieId}
            contentContainerStyle={styles.horizontalList}
            renderItem={({ item }: { item: any }) => (
              <TouchableOpacity
                style={styles.continueCard}
                activeOpacity={0.8}
                onPress={() =>
                  navigation.navigate('Player', {
                    infoHash: item.movieId,
                    contentKey: item.contentKey,
                    magnetURI: item.magnetURI || undefined,
                    fileIndex: item.fileIndex,
                    streamURL: item.streamURL,
                    title: item.title,
                    posterUrl: item.poster,
                    currentTime: item.currentTime,
                    duration: item.duration,
                    isSeries: item.contentType === 'episode',
                    seriesTitle: item.seriesTitle,
                    seasonNumber: item.seasonNumber,
                    episodeNumber: item.episodeNumber
                  })
                }
              >
                <MediaCard
                  title={item.title}
                  posterUrl={item.poster}
                  width={120}
                  onPress={() =>
                    navigation.navigate('Player', {
                      infoHash: item.movieId,
                      contentKey: item.contentKey,
                      magnetURI: item.magnetURI || undefined,
                      fileIndex: item.fileIndex,
                      streamURL: item.streamURL,
                      title: item.title,
                      posterUrl: item.poster,
                      currentTime: item.currentTime,
                      duration: item.duration,
                      isSeries: item.contentType === 'episode',
                      seriesTitle: item.seriesTitle,
                      seasonNumber: item.seasonNumber,
                      episodeNumber: item.episodeNumber
                    })
                  }
                />
                {/* Progress bar */}
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${Math.min(100, (item.progress || 0) * 100)}%` }]} />
                </View>
                {item.currentTime ? (
                  <Text style={styles.resumeTimeText}>{formatResumeTime(item.currentTime)}</Text>
                ) : null}
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}

      {/* Trending Now */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Popular Movies</Text>
        <FlatList
          data={trending}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item: any) => String(item.id || item.slug)}
          contentContainerStyle={styles.horizontalList}
          renderItem={({ item }: { item: any }) => (
            <MediaCard
              title={item.title}
              posterUrl={item.poster_url || item.poster}
              year={item.year || item.release_date?.slice(0, 4)}
              rating={item.rating || item.avg_rating}
              onPress={() => navigation.navigate('MovieDetail', { slug: item.slug, id: item.id })}
            />
          )}
        />
      </View>

      {/* Recent Releases */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>More Movies</Text>
        <FlatList
          data={recent}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item: any) => String(item.id || item.slug)}
          contentContainerStyle={styles.horizontalList}
          renderItem={({ item }: { item: any }) => (
            <MediaCard
              title={item.title}
              posterUrl={item.poster_url || item.poster}
              year={item.year || item.release_date?.slice(0, 4)}
              rating={item.rating || item.avg_rating}
              onPress={() => navigation.navigate('MovieDetail', { slug: item.slug, id: item.id })}
            />
          )}
        />
      </View>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center'
  },
  heroContainer: {
    height: 380,
    width: '100%'
  },
  heroImage: {
    width: '100%',
    height: '100%'
  },
  heroGradient: {
    flex: 1,
    backgroundColor: 'rgba(9, 13, 22, 0.75)',
    justifyContent: 'flex-end',
    padding: 20,
    paddingBottom: 24
  },
  heroBadge: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6
  },
  heroTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 6
  },
  heroOverview: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16
  },
  heroActions: {
    flexDirection: 'row',
    gap: 12
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  secondaryBtn: {
    backgroundColor: colors.surfaceLight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  secondaryBtnText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600'
  },
  section: {
    marginTop: 24
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 12
  },
  horizontalList: {
    paddingHorizontal: 16
  },
  continueCard: {
    marginRight: 12
  },
  progressBarBg: {
    height: 3,
    backgroundColor: colors.surfaceLight,
    borderRadius: 2,
    marginTop: -10,
    marginBottom: 4,
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary
  },
  resumeTimeText: {
    color: colors.textMuted,
    fontSize: 10
  }
})
