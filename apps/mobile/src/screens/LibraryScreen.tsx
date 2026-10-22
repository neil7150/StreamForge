import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert
} from 'react-native'
import { Trash2, Play, Film, Clock } from 'lucide-react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { RootStackParamList, MainTabParamList } from '../navigation/types'
import { MediaCard } from '../components/ui/MediaCard'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme/colors'
import { useUserDataStore, type WatchlistItem, type WatchHistoryItem } from '@streamforge/core'
import { formatResumeTime } from '@streamforge/core/policies'

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Library'>,
  NativeStackScreenProps<RootStackParamList>
>

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const COLUMN_COUNT = 3
const ITEM_WIDTH = (SCREEN_WIDTH - 32 - (COLUMN_COUNT - 1) * 10) / COLUMN_COUNT

export const LibraryScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets()
  const [activeTab, setActiveTab] = useState<'watchlist' | 'history'>('watchlist')

  const watchlist = useUserDataStore((s) => s.watchlist)
  const history = useUserDataStore((s) => s.history)
  const removeFromWatchlist = useUserDataStore((s) => s.removeFromWatchlist)
  const removeFromHistory = useUserDataStore((s) => s.removeFromHistory)
  const clearHistory = useUserDataStore((s) => s.clearHistory)

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Watch History',
      'Are you sure you want to clear your entire watch history?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearHistory }
      ]
    )
  }

  return (
    <View style={styles.container}>
      {/* Tab Switcher */}
      <View style={[styles.tabContainer, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'watchlist' && styles.tabBtnActive]}
          onPress={() => setActiveTab('watchlist')}
        >
          <Text style={[styles.tabText, activeTab === 'watchlist' && styles.tabTextActive]}>
            Watchlist ({watchlist.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            History ({history.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Watchlist View */}
      {activeTab === 'watchlist' ? (
        <FlatList
          key="watchlist-grid"
          data={watchlist}
          numColumns={COLUMN_COUNT}
          keyExtractor={(item: WatchlistItem) => item.movieId}
          contentContainerStyle={styles.gridContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Film size={40} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>Your watchlist is empty</Text>
              <Text style={styles.emptySubtitle}>
                Add movies and series to your watchlist to track what you want to watch.
              </Text>
            </View>
          }
          renderItem={({ item }: { item: WatchlistItem }) => (
            <MediaCard
              title={item.title}
              posterUrl={item.poster}
              year={item.year}
              rating={item.rating}
              width={ITEM_WIDTH}
              onPress={() => item.contentType === 'series'
                ? navigation.navigate('SeriesDetail', { slug: item.slug, id: item.catalogId })
                : navigation.navigate('MovieDetail', { slug: item.slug, id: item.movieId })}
            />
          )}
        />
      ) : (
        /* History View */
        <FlatList
          key="history-list"
          data={history}
          keyExtractor={(item: WatchHistoryItem) => item.contentKey || item.movieId}
          contentContainerStyle={styles.historyListContent}
          ListHeaderComponent={
            history.length > 0 ? (
              <View style={styles.historyHeader}>
                <Text style={styles.historyCountText}>{history.length} watched titles</Text>
                <TouchableOpacity onPress={handleClearHistory} style={styles.clearBtn}>
                  <Trash2 size={14} color={colors.error} />
                  <Text style={styles.clearBtnText}>Clear All</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Clock size={40} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>No watch history yet</Text>
              <Text style={styles.emptySubtitle}>
                Media you stream will automatically appear here with your saved position.
              </Text>
            </View>
          }
          renderItem={({ item }: { item: WatchHistoryItem }) => (
            <TouchableOpacity
              style={styles.historyItem}
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
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.historyTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.currentTime ? (
                  <Text style={styles.historyTime}>
                    Resume at {formatResumeTime(item.currentTime)}
                  </Text>
                ) : null}
                <View style={styles.historyProgressBarBg}>
                  <View
                    style={[
                      styles.historyProgressBarFill,
                      { width: `${Math.min(100, (item.progress || 0) * 100)}%` }
                    ]}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={styles.historyDeleteBtn}
                onPress={() => removeFromHistory(item.contentKey || item.movieId)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Trash2 size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </TouchableOpacity>
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
  tabContainer: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 8,
    gap: 8
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600'
  },
  tabTextActive: {
    color: '#ffffff'
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24
  },
  historyListContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 24
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4
  },
  historyCountText: {
    color: colors.textSecondary,
    fontSize: 12
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  clearBtnText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '600'
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12
  },
  historyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600'
  },
  historyTime: {
    color: colors.primary,
    fontSize: 11,
    marginTop: 4
  },
  historyProgressBarBg: {
    height: 3,
    backgroundColor: colors.surfaceLight,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden'
  },
  historyProgressBarFill: {
    height: '100%',
    backgroundColor: colors.primary
  },
  historyDeleteBtn: {
    padding: 6
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    marginTop: 40
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18
  }
})
