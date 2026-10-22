import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  ImageBackground,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator
} from 'react-native'
import { Play, Star, Plus, Check, ArrowLeft } from 'lucide-react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/types'
import { SourcePickerModal } from '../components/ui/SourcePickerModal'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme/colors'
import { api, tvmazeClient } from '@streamforge/core/clients'
import { searchEpisodeTorrents } from '@streamforge/core/search'
import { rankSources } from '@streamforge/core/policies'
import { usePlaybackSettingsStore, useUserDataStore } from '@streamforge/core/stores'
import { extractInfoHash } from '@streamforge/core/utils'
import type { TorrentSearchResult, EpisodeSummary, SeasonSummary } from '@streamforge/core/types'
import { RequestGate } from '../data/request-gate'

type Props = NativeStackScreenProps<RootStackParamList, 'SeriesDetail'>

export const SeriesDetailScreen = ({ navigation, route }: Props) => {
  const insets = useSafeAreaInsets()
  const { slug, id } = route.params
  const [show, setShow] = useState<any>(null)
  const [seasons, setSeasons] = useState<SeasonSummary[]>([])
  const [selectedSeason, setSelectedSeason] = useState<number>(1)
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false)

  // Episode torrent picker
  const [modalVisible, setModalVisible] = useState(false)
  const [selectedEpisode, setSelectedEpisode] = useState<EpisodeSummary | null>(null)
  const [episodeSources, setEpisodeSources] = useState<TorrentSearchResult[]>([])
  const [isSearchingEpisode, setIsSearchingEpisode] = useState(false)
  const sourceRequests = useRef(new RequestGate())
  const detailsRequests = useRef(new RequestGate())
  const [loadError, setLoadError] = useState<string | null>(null)

  const playbackSettings = usePlaybackSettingsStore()
  const watchlist = useUserDataStore((s) => s.watchlist)
  const addToWatchlist = useUserDataStore((s) => s.addToWatchlist)
  const removeFromWatchlist = useUserDataStore((s) => s.removeFromWatchlist)

  const watchlistKey = show ? `series:${show.id || slug}` : ''
  const isSaved = watchlist.some(w => w.movieId === watchlistKey)
  const toggleWatchlist = () => {
    if (!show) return
    if (isSaved) removeFromWatchlist(watchlistKey)
    else addToWatchlist({
      movieId: watchlistKey, contentType: 'series', catalogId: id ?? show.id,
      slug, title: show.title, poster: show.poster_url || show.posterUrl || '',
      year: 0, rating: Number(show.rating?.average || show.avg_rating || show.rating) || 0, magnetURI: ''
    })
  }

  const loadShow = useCallback(async () => {
    const request = detailsRequests.current.begin()
    sourceRequests.current.cancel()
    setIsLoading(true)
    setLoadError(null)
    setShow(null)
    setSeasons([])
    try {
      if (typeof id === 'number') {
        const [showDetails, seasonList] = await Promise.all([
          tvmazeClient.getSeries(id),
          tvmazeClient.getSeasons(id)
        ])
        if (!request.isCurrent()) return
        setShow(showDetails)
        setSeasons(seasonList)
        if (seasonList.length > 0) {
          setSelectedSeason(seasonList[0].number)
        }
      } else {
        const res = await api.getShowBySlug(slug)
        if (!request.isCurrent()) return
        if (res?.data) {
          setShow(res.data)
          if (res.data.seasons?.length) {
            setSeasons(res.data.seasons)
            setSelectedSeason(res.data.seasons[0].season_number || 1)
          }
        }
      }
    } catch (err) {
      if (request.isCurrent()) setLoadError('Could not load this series. Check your connection and retry.')
    } finally {
      if (request.isCurrent()) setIsLoading(false)
    }
  }, [id, slug])

  useEffect(() => {
    loadShow()
    return () => { detailsRequests.current.cancel(); sourceRequests.current.cancel() }
  }, [loadShow])

  // Load episodes when selectedSeason changes
  useEffect(() => {
    let active = true
    setEpisodes([])
    setIsLoadingEpisodes(false)
    if (!show) return
    const seasonObj = seasons.find((s: any) => (s.number ?? s.season_number) === selectedSeason)
    if (!seasonObj) return

    setIsLoadingEpisodes(true)
    if (typeof id === 'number') {
      tvmazeClient.getSeasonEpisodes(seasonObj.id)
        .then((eps: EpisodeSummary[]) => { if (active) setEpisodes(eps) })
        .catch(() => { if (active) setEpisodes([]) })
        .finally(() => { if (active) setIsLoadingEpisodes(false) })
    } else {
      // From backend content service
      if ((seasonObj as any).episodes) {
        setEpisodes((seasonObj as any).episodes)
        setIsLoadingEpisodes(false)
      } else {
        setIsLoadingEpisodes(false)
      }
    }
    return () => { active = false }
  }, [show, selectedSeason, seasons, id])

  const handlePlayEpisode = async (episode: EpisodeSummary) => {
    const request = sourceRequests.current.begin()
    setSelectedEpisode(episode)
    setEpisodeSources([])
    setModalVisible(true)
    setIsSearchingEpisode(true)

    const epNum = episode.episodeNumber ?? (episode as any).episode_number ?? 1
    const sNum = episode.seasonNumber ?? (episode as any).season_number ?? selectedSeason

    try {
      const res = await searchEpisodeTorrents({
        seriesTitle: show.title,
        seasonNumber: sNum,
        episodeNumber: epNum,
        episodeTitle: episode.title,
        imdbId: show.imdb_id || show.imdbId
      })
      if (request.isCurrent() && res.results?.length) {
        const ranked = rankSources(res.results, playbackSettings)
        setEpisodeSources(ranked)
      }
    } catch {
      if (request.isCurrent()) setEpisodeSources([])
    } finally {
      if (request.isCurrent()) setIsSearchingEpisode(false)
    }
  }

  const handleSelectSource = (source: TorrentSearchResult) => {
    setModalVisible(false)
    const hash = extractInfoHash(source.magnetURI)
    if (hash && selectedEpisode) {
      const epNum = selectedEpisode.episodeNumber ?? (selectedEpisode as any).episode_number ?? 1
      const sNum = selectedEpisode.seasonNumber ?? (selectedEpisode as any).season_number ?? selectedSeason
      navigation.navigate('Player', {
        infoHash: hash,
        contentKey: `episode:${show.id || slug}:${sNum}:${epNum}`,
        title: `${show.title} - S${sNum}E${epNum}: ${selectedEpisode.title}`,
        posterUrl: selectedEpisode.stillUrl || (selectedEpisode as any).still_url || show.poster_url || show.posterUrl,
        isSeries: true,
        seriesTitle: show.title,
        seasonNumber: sNum,
        episodeNumber: epNum,
        magnetURI: source.magnetURI,
        fileIndex: source.fileIndex
      })
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!show) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{loadError || 'Series not found.'}</Text>
        <TouchableOpacity onPress={loadShow} style={{ padding: 16 }}><Text style={{ color: colors.primary }}>Retry</Text></TouchableOpacity>
      </View>
    )
  }

  const backdrop = show.backdrop_url || show.originalImageUrl || show.poster_url || show.posterUrl
  const rating = show.rating?.average || show.avg_rating || show.rating

  return (
    <View style={styles.container}>
      {/* Floating Back Button */}
      <TouchableOpacity
        style={[styles.floatingBackBtn, { top: insets.top + 10 }]}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <ArrowLeft size={20} color="#FFFFFF" />
      </TouchableOpacity>

      <FlatList
        style={styles.scroll}
        data={episodes}
        keyExtractor={(item: any, index) => String(item.id ?? item.episodeNumber ?? index)}
        initialNumToRender={8}
        windowSize={5}
        ListHeaderComponent={<>

        <ImageBackground source={{ uri: backdrop }} style={styles.backdrop} resizeMode="cover">
        <View style={styles.backdropOverlay} />
      </ImageBackground>

      <View style={styles.content}>
        <View style={styles.mainInfo}>
          <Image
            source={{ uri: show.poster_url || show.posterUrl }}
            style={styles.poster}
            resizeMode="cover"
          />
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={styles.title}>{show.title}</Text>
            {show.network?.name || show.network ? (
              <Text style={styles.networkText}>
                {typeof show.network === 'string' ? show.network : show.network.name}
              </Text>
            ) : null}

            <View style={styles.badgeRow}>
              {rating ? (
                <View style={styles.iconMeta}>
                  <Star size={12} color="#fbbf24" fill="#fbbf24" />
                  <Text style={[styles.metaBadge, { color: '#fbbf24' }]}>
                    {Number(rating).toFixed(1)}
                  </Text>
                </View>
              ) : null}
              {show.genres?.map((g: any, i: number) => {
                const genreName = typeof g === 'string' ? g : g?.name
                return genreName ? <Text key={i} style={styles.genreTag}>{genreName}</Text> : null
              })}
            </View>
          </View>
        </View>

        {/* Synopsis */}
        <TouchableOpacity onPress={toggleWatchlist} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16 }}>
          {isSaved ? <Check size={18} color={colors.primary} /> : <Plus size={18} color={colors.primary} />}
          <Text style={{ color: colors.primary }}>{isSaved ? 'Remove from watchlist' : 'Add to watchlist'}</Text>
        </TouchableOpacity>
        <Text style={styles.overview} numberOfLines={4}>
          {show.overview || show.summary?.replace(/<[^>]*>/g, '') || ''}
        </Text>

        {/* Season Selector Chips */}
        {seasons.length > 0 ? (
          <View style={styles.seasonBar}>
            <FlatList
              data={seasons}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item: any) => String(item.id || item.number || item.season_number)}
              renderItem={({ item }: { item: any }) => {
                const sNum = item.number ?? item.season_number
                return (
                  <TouchableOpacity
                    style={[
                      styles.seasonChip,
                      selectedSeason === sNum && styles.seasonChipActive
                    ]}
                    onPress={() => setSelectedSeason(sNum)}
                  >
                    <Text
                      style={[
                        styles.seasonChipText,
                        selectedSeason === sNum && styles.seasonChipTextActive
                      ]}
                    >
                      Season {sNum}
                    </Text>
                  </TouchableOpacity>
                )
              }}
            />
          </View>
        ) : null}


          <Text style={styles.sectionHeader}>Episodes</Text>
        </View>
        </>}
        ListEmptyComponent={isLoadingEpisodes ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.emptyText}>No episode list available.</Text>}
        renderItem={({ item }: { item: any }) => <View style={styles.episodesSection}>
              <TouchableOpacity
                style={styles.episodeCard}
                onPress={() => handlePlayEpisode(item)}
                activeOpacity={0.7}
              >
                {item.stillUrl || item.still_url ? (
                  <Image
                    source={{ uri: item.stillUrl || item.still_url }}
                    style={styles.episodeStill}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.episodeStillPlaceholder}>
                    <Play size={20} color={colors.textSecondary} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.episodeTitle} numberOfLines={1}>
                    {item.episodeNumber || item.episode_number}. {item.title}
                  </Text>
                  <Text style={styles.episodeOverview} numberOfLines={2}>
                    {item.overview || item.summary?.replace(/<[^>]*>/g, '') || 'Tap to search sources & stream'}
                  </Text>
                </View>
                <View style={styles.playIconBox}>
                  <Play size={14} color="#ffffff" fill="#ffffff" />
                </View>
              </TouchableOpacity>
        </View>}
      />
      {/* Episode Torrent Sources Modal */}
      <SourcePickerModal
        visible={modalVisible}
        onClose={() => { sourceRequests.current.cancel(); setIsSearchingEpisode(false); setModalVisible(false) }}
        onSelectSource={handleSelectSource}
        sources={episodeSources}
        isLoading={isSearchingEpisode}
        title={`${show.title} S${selectedSeason}E${selectedEpisode?.episodeNumber ?? (selectedEpisode as any)?.episode_number ?? 1}`}
      />

    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  scroll: {
    flex: 1
  },
  floatingBackBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(9, 13, 22, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 14
  },
  backdrop: {
    width: '100%',
    height: 200
  },
  backdropOverlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 13, 22, 0.65)'
  },
  content: {
    padding: 16,
    marginTop: -40
  },
  mainInfo: {
    flexDirection: 'row'
  },
  poster: {
    width: 100,
    height: 150,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800'
  },
  networkText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    alignItems: 'center'
  },
  iconMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  metaBadge: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600'
  },
  genreTag: {
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border
  },
  overview: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 14
  },
  seasonBar: {
    marginTop: 20
  },
  seasonChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  seasonChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  seasonChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600'
  },
  seasonChipTextActive: {
    color: '#ffffff'
  },
  episodesSection: {
    marginTop: 24,
    marginBottom: 32
  },
  sectionHeader: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12
  },
  episodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  episodeStill: {
    width: 80,
    height: 50,
    borderRadius: 6
  },
  episodeStillPlaceholder: {
    width: 80,
    height: 50,
    borderRadius: 6,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center'
  },
  episodeTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600'
  },
  episodeOverview: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 3
  },
  playIconBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16
  }
})
