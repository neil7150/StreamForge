import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard
} from 'react-native'
import { Magnet, Play } from 'lucide-react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { RootStackParamList, MainTabParamList } from '../navigation/types'
import { Poster } from '../components/ui/Poster'
import { SearchBar } from '../components/ui/SearchBar'
import { SourcePickerModal } from '../components/ui/SourcePickerModal'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme/colors'
import { mobileCatalog as catalog, searchSections, type MobileCatalogItem } from '../data/mobile-catalog'
import { searchMovieTorrents } from '@streamforge/core/search'
import { isValidMagnet, extractInfoHash } from '@streamforge/core/utils'
import type { TorrentSearchResult } from '@streamforge/core/types'
import { RequestGate } from '../data/request-gate'
import { rankSources } from '@streamforge/core/policies'
import { usePlaybackSettingsStore } from '@streamforge/core/stores'

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Search'>,
  NativeStackScreenProps<RootStackParamList>
>

export const SearchScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MobileCatalogItem[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSearchingTorrents, setIsSearchingTorrents] = useState(false)

  // Torrent source picker modal
  const [modalVisible, setModalVisible] = useState(false)
  const [activeMediaTitle, setActiveMediaTitle] = useState('')
  const [activePoster, setActivePoster] = useState<string | null>(null)
  const [activeContentKey, setActiveContentKey] = useState<string | undefined>()
  const [searchError, setSearchError] = useState<string | null>(null)
  const [torrentSources, setTorrentSources] = useState<TorrentSearchResult[]>([])

  const debounceTimer = useRef<NodeJS.Timeout | null>(null)
  const requests = useRef(new RequestGate())
  const sourceRequests = useRef(new RequestGate())
  useEffect(() => () => {
    requests.current.cancel(); sourceRequests.current.cancel()
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
  }, [])

  const isMagnet = isValidMagnet(query)
  const infoHash = extractInfoHash(query)

  const handleSearch = useCallback(async (text: string) => {
    const request = requests.current.begin()
    setSearchError(null)
    if (!text || text.trim().length < 2) {
      setResults([])
      setSuggestions([])
      setIsLoading(false)
      return
    }

    if (isValidMagnet(text)) {
      return
    }

    setIsLoading(true)
    try {
      const response = await catalog.search(text, 'all', 1, request.signal)
      if (!request.isCurrent()) return
      setResults(response.data)
      setSearchError(response.warning)
      setSuggestions(response.data.slice(0, 6))
    } catch {
      if (request.isCurrent()) { setResults([]); setSearchError('Search is unavailable. Please retry.') }
    } finally {
      if (request.isCurrent()) setIsLoading(false)
    }
  }, [])

  const onChangeText = (text: string) => {
    requests.current.cancel()
    setIsLoading(false)
    setSuggestions([])
    setResults([])
    setQuery(text)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      handleSearch(text)
    }, 350)
  }

  const handleSelectSuggestion = (suggestion: any) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    setQuery(suggestion.title)
    Keyboard.dismiss()
    handleSearch(suggestion.title)
  }

  const handlePlayDirectMagnet = () => {
    if (!infoHash) return
    navigation.navigate('Player', {
      infoHash,
      title: 'Direct Magnet Stream',
      magnetURI: query
    })
  }

  const handleScrapeTorrentSources = async (media: any) => {
    if (media.type === 'show') {
      navigation.navigate('SeriesDetail', { slug: media.slug, id: media.id })
      return
    }
    const request = sourceRequests.current.begin()
    setActiveMediaTitle(media.title)
    setActivePoster(media.poster_url || media.posterUrl || null)
    setActiveContentKey(media.id || media.slug ? `movie:${media.id || media.slug}` : undefined)
    setTorrentSources([])
    setModalVisible(true)
    setIsSearchingTorrents(true)

    try {
      const year = media.year || (media.release_date ? new Date(media.release_date).getFullYear() : undefined)
      const res = await searchMovieTorrents({
        title: media.title,
        year
      })
      if (request.isCurrent()) setTorrentSources(rankSources(res.results || [], usePlaybackSettingsStore.getState()))
    } catch {
      if (request.isCurrent()) setTorrentSources([])
    } finally {
      if (request.isCurrent()) setIsSearchingTorrents(false)
    }
  }

  const handleSelectTorrentSource = (source: TorrentSearchResult) => {
    setModalVisible(false)
    const hash = extractInfoHash(source.magnetURI)
    if (hash) {
      navigation.navigate('Player', {
        infoHash: hash,
        contentKey: activeContentKey,
        title: activeMediaTitle || source.name,
        posterUrl: activePoster,
        magnetURI: source.magnetURI,
        fileIndex: source.fileIndex
      })
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.searchHeader, { paddingTop: insets.top + 12 }]}>
        <SearchBar
          value={query}
          onChangeText={onChangeText}
          onSubmit={() => { if (debounceTimer.current) clearTimeout(debounceTimer.current); void handleSearch(query) }}
        />
      </View>

      {/* Magnet link direct stream banner */}
      {searchError && results.length > 0 ? <Text style={{ color: colors.textSecondary, padding: 16 }}>{searchError}</Text> : null}
      {isMagnet && infoHash ? (
        <TouchableOpacity
          style={styles.magnetBanner}
          onPress={handlePlayDirectMagnet}
          activeOpacity={0.8}
        >
          <View style={styles.magnetIconBox}>
            <Magnet size={24} color="#ffffff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.magnetTitle}>Magnet Link Detected</Text>
            <Text style={styles.magnetHash} numberOfLines={1}>
              {infoHash}
            </Text>
            <Text style={styles.magnetAction}>Tap to Stream Immediately</Text>
          </View>
          <Play size={20} color={colors.primary} fill={colors.primary} />
        </TouchableOpacity>
      ) : null}

      {/* Typeahead suggestions when results are not yet submitted */}
      {suggestions.length > 0 && results.length === 0 && !isMagnet ? (
        <View style={styles.suggestionsContainer}>
          {suggestions.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.suggestionItem}
              onPress={() => handleSelectSuggestion(item)}
            >
              <Text style={styles.suggestionText}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Search results list */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.searchingText}>Searching catalog...</Text>
        </View>
      ) : (
        <SectionList
          sections={searchSections(results)}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '700', paddingVertical: 14 }}>{section.title} ({section.data.length})</Text>}
          keyExtractor={(item: any) => `${item.type}:${item.id || item.slug}`}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            query.length >= 2 && !isMagnet ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>{searchError || 'No catalog results'}</Text>
                {searchError ? <TouchableOpacity onPress={() => { void handleSearch(query) }} style={{ padding: 16 }}><Text style={{ color: colors.primary }}>Retry</Text></TouchableOpacity> : null}
                <TouchableOpacity
                  style={styles.scrapeBtn}
                  onPress={() => handleScrapeTorrentSources({ title: query })}
                >
                  <Text style={styles.scrapeBtnText}>
                    Search Torrent Swarms for "{query}"
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item }: { item: any }) => (
            <TouchableOpacity
              style={styles.resultItem}
              onPress={() => {
                if (item.type === 'show') {
                  navigation.navigate('SeriesDetail', { slug: item.slug, id: item.id })
                } else {
                  navigation.navigate('MovieDetail', { slug: item.slug, id: item.id })
                }
              }}
              activeOpacity={0.7}
            >
              <Poster uri={item.poster_url || item.posterUrl} title={item.title} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resultTitle}>{item.title}</Text>
                <Text style={styles.resultMeta}>
                  {item.type === 'show' ? 'TV Series' : 'Movie'}
                  {item.year ? ` • ${item.year}` : ''}
                  {item.avg_rating ? ` • ★ ${Number(item.avg_rating).toFixed(1)}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.streamIconBtn}
                accessibilityRole="button" accessibilityLabel={`Choose a source for ${item.title}`}
                onPress={() => handleScrapeTorrentSources(item)}
              >
                <Play size={16} color="#ffffff" fill="#ffffff" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Torrent source picker modal */}
      <SourcePickerModal
        visible={modalVisible}
        onClose={() => { sourceRequests.current.cancel(); setIsSearchingTorrents(false); setModalVisible(false) }}
        onSelectSource={handleSelectTorrentSource}
        sources={torrentSources}
        isLoading={isSearchingTorrents}
        title={activeMediaTitle}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  searchHeader: {
    padding: 16,
    paddingBottom: 8
  },
  magnetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: 12
  },
  magnetIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  magnetTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  magnetHash: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 2
  },
  magnetAction: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4
  },
  suggestionsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  suggestionItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.border
  },
  suggestionText: {
    color: colors.textSecondary,
    fontSize: 14
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  searchingText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 12
  },
  listContent: {
    padding: 16
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12
  },
  mediaIconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center'
  },
  resultTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600'
  },
  resultMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 3
  },
  streamIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center'
  },
  emptyTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 16
  },
  scrapeBtn: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary
  },
  scrapeBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600'
  }
})
