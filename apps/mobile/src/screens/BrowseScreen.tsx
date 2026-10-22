import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { RootStackParamList, MainTabParamList } from '../navigation/types'
import { MediaCard } from '../components/ui/MediaCard'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme/colors'
import { api } from '@streamforge/core/clients'
import { RequestGate } from '../data/request-gate'

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Browse'>,
  NativeStackScreenProps<RootStackParamList>
>

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const COLUMN_COUNT = 3
const ITEM_WIDTH = (SCREEN_WIDTH - 32 - (COLUMN_COUNT - 1) * 10) / COLUMN_COUNT

export const BrowseScreen = ({ navigation, route }: Props) => {
  const insets = useSafeAreaInsets()
  const [selectedType, setSelectedType] = useState<'movie' | 'show'>('movie')
  const [selectedGenre, setSelectedGenre] = useState<string>(route.params?.genre || 'all')
  const [items, setItems] = useState<any[]>([])
  const [genres, setGenres] = useState([{ id: 'all', name: 'All', slug: 'all' }])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const requests = useRef(new RequestGate())
  const inFlight = useRef(false)

  const loadData = useCallback(async (pageNum = 1, append = false) => {
    const request = requests.current.begin()
    inFlight.current = true
    setLoadError(null)
    try {
      if (pageNum === 1) setIsLoading(true)
      else setLoadingMore(true)

      if (selectedType === 'movie') {
        const res = await api.getMovies(pageNum, 24, selectedGenre === 'all' ? undefined : selectedGenre, request.signal)
        if (!request.isCurrent()) return
        const newItems = res?.data || []
        setItems(append ? (prev) => [...prev, ...newItems].slice(0, 480) : newItems)
        setHasMore(newItems.length >= 24 && pageNum < 20)
      } else {
        const res = await api.getShows(pageNum, 24, selectedGenre === 'all' ? undefined : selectedGenre, request.signal)
        if (!request.isCurrent()) return
        const newItems = res?.data || []
        setItems(append ? (prev) => [...prev, ...newItems].slice(0, 480) : newItems)
        setHasMore(newItems.length >= 24 && pageNum < 20)
      }
    } catch {
      if (!request.isCurrent()) return
      if (!append) setItems([])
      setLoadError('Could not load titles. Check your connection and retry.')
      setHasMore(false)
    } finally {
      if (request.isCurrent()) { inFlight.current = false; setIsLoading(false); setLoadingMore(false) }
    }
  }, [selectedType, selectedGenre])

  useEffect(() => {
    setPage(1)
    loadData(1, false)
    return () => requests.current.cancel()
  }, [loadData])

  useEffect(() => {
    api.getGenres().then((res) => {
      if (res?.data?.length) {
        setGenres([{ id: 'all', name: 'All', slug: 'all' }, ...res.data])
      }
    }).catch(() => {})
  }, [])

  const handleEndReached = () => {
    if (!inFlight.current && !loadingMore && hasMore && !isLoading) {
      const nextPage = page + 1
      setPage(nextPage)
      loadData(nextPage, true)
    }
  }

  return (
    <View style={styles.container}>
      {/* Type Toggle */}
      <View style={[styles.toggleContainer, { marginTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={[styles.toggleBtn, selectedType === 'movie' && styles.toggleBtnActive]}
          onPress={() => setSelectedType('movie')}
        >
          <Text style={[styles.toggleText, selectedType === 'movie' && styles.toggleTextActive]}>
            Movies
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, selectedType === 'show' && styles.toggleBtnActive]}
          onPress={() => setSelectedType('show')}
        >
          <Text style={[styles.toggleText, selectedType === 'show' && styles.toggleTextActive]}>
            TV Shows
          </Text>
        </TouchableOpacity>
      </View>

      {/* Genre Chips */}
      <View style={styles.genreBar}>
        <FlatList
          data={genres}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item: any) => item.slug}
          contentContainerStyle={styles.genreList}
          renderItem={({ item }: { item: any }) => (
            <TouchableOpacity
              style={[
                styles.genreChip,
                selectedGenre === item.slug && styles.genreChipActive
              ]}
              onPress={() => setSelectedGenre(item.slug)}
            >
              <Text
                style={[
                  styles.genreChipText,
                  selectedGenre === item.slug && styles.genreChipTextActive
                ]}
              >
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Content Grid */}
      {loadError ? (
        <TouchableOpacity onPress={() => { setPage(1); void loadData(1) }} style={{ padding: 16 }} accessibilityRole="button">
          <Text style={{ color: colors.textSecondary }}>{loadError}</Text>
          <Text style={{ color: colors.primary }}>Retry</Text>
        </TouchableOpacity>
      ) : null}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          numColumns={COLUMN_COUNT}
          keyExtractor={(item: any, index: number) => `${item.id || item.slug}_${index}`}
          contentContainerStyle={styles.gridContent}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No titles found in this category.</Text>
            </View>
          }
          renderItem={({ item }: { item: any }) => (
            <MediaCard
              title={item.title}
              posterUrl={item.poster_url || item.poster}
              year={item.year || item.release_date?.slice(0, 4) || item.first_air_date?.slice(0, 4)}
              rating={item.rating || item.avg_rating}
              width={ITEM_WIDTH}
              onPress={() => {
                if (selectedType === 'show') {
                  navigation.navigate('SeriesDetail', { slug: item.slug, id: item.id })
                } else {
                  navigation.navigate('MovieDetail', { slug: item.slug, id: item.id })
                }
              }}
            />
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  toggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  toggleText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600'
  },
  toggleTextActive: {
    color: '#ffffff'
  },
  genreBar: {
    paddingVertical: 10
  },
  genreList: {
    paddingHorizontal: 16,
    gap: 8
  },
  genreChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  genreChipActive: {
    backgroundColor: colors.surfaceLight,
    borderColor: colors.primary
  },
  genreChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500'
  },
  genreChipTextActive: {
    color: colors.primary,
    fontWeight: '700'
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center'
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center'
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14
  }
})
