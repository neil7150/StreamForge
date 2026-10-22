import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  Image,
  ImageBackground,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator
} from 'react-native'
import { Play, Plus, Check, Star, Clock, Layers, ArrowLeft } from 'lucide-react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/types'
import { SourcePickerModal } from '../components/ui/SourcePickerModal'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme/colors'
import { api } from '@streamforge/core/clients'
import { useUserDataStore, usePlaybackSettingsStore } from '@streamforge/core/stores'
import { rankSources } from '@streamforge/core/policies'
import { searchMovieTorrents } from '@streamforge/core/search'
import { extractInfoHash } from '@streamforge/core/utils'
import type { TorrentSearchResult } from '@streamforge/core/types'
import { RequestGate } from '../data/request-gate'

type Props = NativeStackScreenProps<RootStackParamList, 'MovieDetail'>

export const MovieDetailScreen = ({ navigation, route }: Props) => {
  const insets = useSafeAreaInsets()
  const { slug } = route.params
  const [movie, setMovie] = useState<any>(null)
  const [sources, setSources] = useState<TorrentSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSearchingSources, setIsSearchingSources] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const detailsRequests = useRef(new RequestGate())
  const sourceRequests = useRef(new RequestGate())

  const watchlist = useUserDataStore((s) => s.watchlist)
  const addToWatchlist = useUserDataStore((s) => s.addToWatchlist)
  const removeFromWatchlist = useUserDataStore((s) => s.removeFromWatchlist)
  const playbackSettings = usePlaybackSettingsStore()

  const isSaved = movie ? watchlist.some((w) => w.movieId === (movie.id || movie.slug)) : false

  const loadMovie = useCallback(async () => {
    const request = detailsRequests.current.begin()
    sourceRequests.current.cancel()
    setMovie(null)
    setSources([])
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await api.getMovieBySlug(slug, request.signal)
      if (!request.isCurrent()) return
      if (res?.data) {
        setMovie(res.data)
        // If movie has magnets attached from backend catalog
        const magnetList = res.data.magnet_links || res.data.magnets
        if (magnetList?.length) {
          const mapped: TorrentSearchResult[] = magnetList.map((m: any) => ({
            id: m.id || m.info_hash,
            name: `${res.data.title}${m.quality ? ` [${m.quality}]` : ''}`,
            magnetURI: m.magnet_uri,
            seeders: m.seed_count ?? 0,
            leechers: m.peer_count ?? 0,
            size: m.file_size_bytes ? `${(m.file_size_bytes / 1024 / 1024 / 1024).toFixed(1)} GB` : 'Unknown',
            sizeBytes: m.file_size_bytes || 0,
            category: 'Movies',
            added: new Date().toISOString(),
            provider: 'StreamForge' as any
          }))
          setSources(mapped)
        }
      } else {
        setMovie(null)
        setLoadError('Movie not found.')
      }
    } catch {
      if (!request.isCurrent()) return
      setMovie(null)
      setLoadError('Could not load this movie. Check your connection and retry.')
    } finally {
      if (request.isCurrent()) setIsLoading(false)
    }
  }, [slug])

  useEffect(() => {
    loadMovie()
    return () => { detailsRequests.current.cancel(); sourceRequests.current.cancel() }
  }, [loadMovie])

  // Automatically search torrent swarms if sources are empty
  const fetchLiveSources = useCallback(async () => {
    if (!movie) return
    const request = sourceRequests.current.begin()
    setIsSearchingSources(true)
    try {
      const year = movie.year || (movie.release_date ? new Date(movie.release_date).getFullYear() : undefined)
      const res = await searchMovieTorrents({
        title: movie.title,
        year,
        imdbId: movie.imdb_id
      })
      if (request.isCurrent() && res.results?.length) {
        const ranked = rankSources(res.results, playbackSettings)
        setSources(ranked)
      }
    } catch (err) {
      console.warn('Failed to search torrent providers:', err)
    } finally {
      if (request.isCurrent()) setIsSearchingSources(false)
    }
  }, [movie, playbackSettings])

  useEffect(() => {
    if (movie && sources.length === 0 && !movie.magnetURI) {
      fetchLiveSources()
    }
  }, [movie, sources.length, fetchLiveSources])

  const handlePlayBest = () => {
    if (movie.magnetURI) {
      const hash = extractInfoHash(movie.magnetURI) || movie.slug
      navigation.navigate('Player', {
        infoHash: hash,
        contentKey: `movie:${movie.id || slug}`,
        title: movie.title,
        posterUrl: movie.poster_url || movie.poster,
        magnetURI: movie.magnetURI
      })
      return
    }

    if (sources.length > 0) {
      const best = sources[0]
      const hash = extractInfoHash(best.magnetURI)
      if (hash) {
        navigation.navigate('Player', {
          infoHash: hash,
          contentKey: `movie:${movie.id || slug}`,
          title: movie.title,
          posterUrl: movie.poster_url || movie.poster,
          magnetURI: best.magnetURI,
          fileIndex: best.fileIndex
        })
      }
      return
    }

    // If no sources yet, open source picker modal to trigger search
    setModalVisible(true)
    fetchLiveSources()
  }

  const handleSelectSource = (source: TorrentSearchResult) => {
    setModalVisible(false)
    const hash = extractInfoHash(source.magnetURI)
    if (hash) {
      navigation.navigate('Player', {
        infoHash: hash,
        contentKey: `movie:${movie.id || slug}`,
        title: movie.title,
        posterUrl: movie.poster_url || movie.poster,
        magnetURI: source.magnetURI,
        fileIndex: source.fileIndex
      })
    }
  }

  const handleToggleWatchlist = () => {
    if (!movie) return
    const id = movie.id || movie.slug
    if (isSaved) {
      removeFromWatchlist(id)
    } else {
      addToWatchlist({
        movieId: id,
        slug: movie.slug,
        title: movie.title,
        poster: movie.poster_url || movie.poster || '',
        year: movie.year || (movie.release_date ? new Date(movie.release_date).getFullYear() : 0),
        rating: movie.rating || movie.avg_rating || 0,
        magnetURI: movie.magnetURI || sources[0]?.magnetURI || ''
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

  if (!movie) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{loadError || 'Movie not found.'}</Text>
        <TouchableOpacity onPress={loadMovie} style={{ padding: 16 }} accessibilityRole="button">
          <Text style={{ color: colors.primary }}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const backdrop = movie.backdrop_url || movie.backdrop || movie.poster_url || movie.poster
  const year = movie.year || (movie.release_date ? new Date(movie.release_date).getFullYear() : null)
  const runtime = movie.runtime || (movie.runtime_minutes ? `${movie.runtime_minutes} min` : null)
  const rating = movie.rating || movie.avg_rating

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

      <ScrollView style={styles.scroll}>
        {/* Backdrop Header */}
        <ImageBackground
          source={{ uri: backdrop }}
          style={styles.backdrop}
          resizeMode="cover"
        >
          <View style={styles.backdropOverlay} />
        </ImageBackground>

      {/* Main Details */}
      <View style={styles.content}>
        <View style={styles.mainInfo}>
          <Image
            source={{ uri: movie.poster_url || movie.poster }}
            style={styles.poster}
            resizeMode="cover"
          />
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={styles.title}>{movie.title}</Text>
            {movie.tagline ? <Text style={styles.tagline}>{movie.tagline}</Text> : null}

            <View style={styles.badgeRow}>
              {year ? <Text style={styles.metaBadge}>{year}</Text> : null}
              {runtime ? (
                <View style={styles.iconMeta}>
                  <Clock size={12} color={colors.textSecondary} />
                  <Text style={styles.metaBadge}>{runtime}</Text>
                </View>
              ) : null}
              {rating ? (
                <View style={styles.iconMeta}>
                  <Star size={12} color="#fbbf24" fill="#fbbf24" />
                  <Text style={[styles.metaBadge, { color: '#fbbf24' }]}>
                    {Number(rating).toFixed(1)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.playBtn}
            onPress={handlePlayBest}
            activeOpacity={0.8}
          >
            <Play size={20} color="#ffffff" fill="#ffffff" />
            <Text style={styles.playBtnText}>Play Stream</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={() => setModalVisible(true)}
          >
            <Layers size={20} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={handleToggleWatchlist}
          >
            {isSaved ? (
              <Check size={20} color={colors.primary} />
            ) : (
              <Plus size={20} color={colors.text} />
            )}
          </TouchableOpacity>
        </View>

        {/* Overview */}
        <View style={styles.synopsisSection}>
          <Text style={styles.sectionHeader}>Synopsis</Text>
          <Text style={styles.overview}>{movie.overview || 'No synopsis available.'}</Text>
        </View>

        {/* Swarm Sources Summary */}
        <View style={styles.sourcesSummary}>
          <Text style={styles.sectionHeader}>Torrent Sources</Text>
          <Text style={styles.sourcesCountText}>
            {sources.length > 0
              ? `${sources.length} sources available. Top source has ${sources[0].seeders} seeds.`
              : isSearchingSources
              ? 'Searching torrent indexers...'
              : 'Tap Choose Source to search torrent providers.'}
          </Text>
          <TouchableOpacity
            style={styles.chooseSourceBtn}
            onPress={() => {
              setModalVisible(true)
              if (sources.length === 0) fetchLiveSources()
            }}
          >
            <Text style={styles.chooseSourceBtnText}>
              {isSearchingSources ? 'Searching...' : 'Browse Available Sources'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Source Picker Modal */}
      <SourcePickerModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSelectSource={handleSelectSource}
        sources={sources}
        isLoading={isSearchingSources}
        title={movie.title}
      />
      </ScrollView>
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
    height: 220
  },
  backdropOverlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 13, 22, 0.6)'
  },
  content: {
    padding: 16,
    marginTop: -50
  },
  mainInfo: {
    flexDirection: 'row'
  },
  poster: {
    width: 110,
    height: 165,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800'
  },
  tagline: {
    color: colors.textSecondary,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    alignItems: 'center'
  },
  metaBadge: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600'
  },
  iconMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    alignItems: 'center'
  },
  playBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8
  },
  playBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700'
  },
  iconActionBtn: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center'
  },
  synopsisSection: {
    marginTop: 24
  },
  sectionHeader: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8
  },
  overview: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  sourcesSummary: {
    marginTop: 24,
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 32
  },
  sourcesCountText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 12
  },
  chooseSourceBtn: {
    backgroundColor: colors.surfaceLight,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  chooseSourceBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600'
  }
})
