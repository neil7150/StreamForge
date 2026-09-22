import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar
} from 'react-native'
import * as ScreenOrientation from 'expo-screen-orientation'
import { useVideoPlayer, VideoView } from 'expo-video'
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  ArrowLeft,
  Users,
  HardDrive
} from 'lucide-react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/types'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme/colors'
import { useUserDataStore, usePlaybackSettingsStore } from '@streamforge/core/stores'
import {
  parseSubtitles,
  findActiveSubtitleCue,
  type SubtitleCue
} from '@streamforge/core/policies'
import { formatDuration } from '@streamforge/core/utils'
import { openSubtitlesClient } from '@streamforge/core/clients'
import type { OnlineSubtitleResult } from '@streamforge/core/types'
import { mobileTorrentAPI } from '../native/torrent-engine'

type Props = NativeStackScreenProps<RootStackParamList, 'Player'>

export const PlayerScreen = ({ navigation, route }: Props) => {
  if (!route.params?.infoHash) {
    return <InvalidPlaybackRequest navigation={navigation} />
  }
  return <PlayerContent navigation={navigation} route={route} />
}

const InvalidPlaybackRequest = ({ navigation }: Pick<Props, 'navigation'>) => (
  <View style={[styles.container, styles.errorContainer]}>
    <StatusBar barStyle="light-content" />
    <Text style={styles.errorTitle}>Invalid Playback Request</Text>
    <Text style={styles.errorSubtitle}>No torrent hash or stream source was provided.</Text>
    <TouchableOpacity style={styles.errorButton} onPress={() => navigation.goBack()}>
      <ArrowLeft size={18} color="#FFFFFF" />
      <Text style={styles.errorButtonText}>Go Back</Text>
    </TouchableOpacity>
  </View>
)

const PlayerContent = ({ navigation, route }: Props) => {
  const insets = useSafeAreaInsets()
  const params = route.params
  const {
    infoHash,
    title = 'Torrent Stream',
    posterUrl,
    streamURL: initialStreamURL,
    magnetURI,
    fileIndex,
    currentTime: initialTime,
    duration: initialDuration,
    isSeries,
    seriesTitle,
    seasonNumber,
    episodeNumber
  } = params

  const isDirectStream = Boolean(initialStreamURL)
  const defaultStreamURL = initialStreamURL || `http://127.0.0.1:8888/stream/${infoHash}`
  const [streamURL, setStreamURL] = useState<string>(defaultStreamURL)
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(initialTime || 0)
  const [duration, setDuration] = useState(initialDuration || 0)
  const [showControls, setShowControls] = useState(true)
  const [trackWidth, setTrackWidth] = useState(0)
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>([])
  const [activeCue, setActiveCue] = useState<string | null>(null)
  const [streamInfo, setStreamInfo] = useState({
    peers: 0,
    speed: '0.0 MB/s',
    buffered: 0
  })
  const [isBuffering, setIsBuffering] = useState(true)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)

  const controlsTimer = useRef<NodeJS.Timeout | null>(null)
  const progressTimer = useRef<NodeJS.Timeout | null>(null)
  const currentTimeRef = useRef(initialTime || 0)
  const durationRef = useRef(initialDuration || 0)

  const addToHistory = useUserDataStore((s) => s.addToHistory)
  const playbackSettings = usePlaybackSettingsStore()
  const openSubtitlesApiKey = playbackSettings.openSubtitlesApiKey
  const preferredSubtitleLanguage = playbackSettings.preferredSubtitleLanguage

  // 1. Initialize native video player via expo-video
  const player = useVideoPlayer(streamURL || null, (p) => {
    p.loop = false
    // expo-video does not emit timeUpdate events when this is zero.
    p.timeUpdateEventInterval = 0.25
    if (initialTime && initialTime > 0) {
      p.currentTime = initialTime
    }
    p.play()
  })

  // 2. Lock to landscape while inside player, return to portrait on exit
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {})

    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {})
    }
  }, [])

  // 3. Resolve the stream URL and subscribe to torrent progress.
  useEffect(() => {
    let isMounted = true
    setPlaybackError(null)
    setIsBuffering(!isDirectStream)

    if (isDirectStream) {
      setIsBuffering(false)
    } else if (magnetURI) {
      const preferredEp = {
        seasonNumber: isSeries ? (seasonNumber || 1) : 0,
        episodeNumber: isSeries ? (episodeNumber || 1) : 0,
        ...(fileIndex !== undefined ? { fileIndex } : {})
      }

      mobileTorrentAPI.addTorrent(magnetURI, preferredEp).then((info) => {
        if (isMounted && info.streamURL) {
          setStreamURL(info.streamURL)
          setIsBuffering(false)
        }
      }).catch((err) => {
        console.warn('Failed to add torrent stream:', err)
        if (isMounted) {
          setPlaybackError(err instanceof Error ? err.message : 'Unable to start torrent playback.')
          setIsBuffering(false)
        }
      })
    } else if (infoHash) {
      mobileTorrentAPI.getStreamURL(infoHash).then((url) => {
        if (isMounted) {
          setStreamURL(url)
          setIsBuffering(false)
        }
      }).catch(() => {
        if (isMounted) {
          setPlaybackError('The stream session is no longer available. Please start playback again.')
          setIsBuffering(false)
        }
      })
    }

    // Load subtitle if API key configured
    if (openSubtitlesApiKey) {
      openSubtitlesClient.searchOnlineSubtitles({
        apiKey: openSubtitlesApiKey,
        query: title,
        language: preferredSubtitleLanguage || 'eng'
      }).then(async (results: OnlineSubtitleResult[]) => {
        if (results?.length && isMounted) {
          const srtText = await openSubtitlesClient.downloadOnlineSubtitle(
            openSubtitlesApiKey,
            results[0].fileId
          )
          const cues = parseSubtitles(srtText)
          if (isMounted) setSubtitles(cues)
        }
      }).catch(() => {})
    }

    // Subscribe to torrent progress
    const unsubProgress = mobileTorrentAPI.onTorrentProgress((progress) => {
      if (isMounted) {
        setStreamInfo({
          peers: progress.numPeers || 0,
          speed: `${((progress.downloadSpeed || 0) / (1024 * 1024)).toFixed(1)} MB/s`,
          buffered: progress.progress || 0
        })
      }
    })

    return () => {
      isMounted = false
      unsubProgress()
    }
  }, [infoHash, magnetURI, fileIndex, title, openSubtitlesApiKey, preferredSubtitleLanguage, isDirectStream, isSeries, seasonNumber, episodeNumber, retryNonce])

  useEffect(() => {
    return () => {
      if (magnetURI) {
        void mobileTorrentAPI.cleanupStream(infoHash).catch(() => {})
      }
    }
  }, [infoHash, magnetURI])

  // 4. Update player source when streamURL changes AFTER initial render
  const initialStreamURLRef = useRef(defaultStreamURL)
  useEffect(() => {
    // Only replace if the URL has actually changed from what the player was
    // initialized with — avoids a redundant reload on first render.
    if (streamURL && player && streamURL !== initialStreamURLRef.current) {
      try {
        initialStreamURLRef.current = streamURL
        player.replace(streamURL)
        player.play()
      } catch (err) {
        console.warn('Failed to replace player source:', err)
      }
    }
  }, [streamURL, player])

  // 5. Subscribe to real native player events (replaces simulated interval clock)
  useEffect(() => {
    if (!player) return

    const subPlaying = player.addListener('playingChange', (event) => {
      setIsPlaying(event.isPlaying)
    })

    const subStatus = player.addListener('statusChange', (event) => {
      if (event.status === 'loading') {
        setIsBuffering(true)
      } else if (event.status === 'readyToPlay') {
        setIsBuffering(false)
        if (player.duration > 0) {
          setDuration(player.duration)
        }
      } else if (event.status === 'error') {
        setPlaybackError('The video player could not open this stream.')
        setIsBuffering(false)
      }
    })

    const subTime = player.addListener('timeUpdate', (event) => {
      currentTimeRef.current = event.currentTime
      setCurrentTime(event.currentTime)
      if (player.duration > 0) {
        durationRef.current = player.duration
        setDuration(player.duration)
      }
    })

    return () => {
      subPlaying.remove()
      subStatus.remove()
      subTime.remove()
    }
  }, [player])

  // 6. Subtitle cue synchronizer
  useEffect(() => {
    if (subtitles.length === 0) {
      setActiveCue(null)
      return
    }
    const cue = findActiveSubtitleCue(subtitles, currentTime, 0)
    setActiveCue(cue ? cue.text : null)
  }, [currentTime, subtitles])

  // 7. Save watch progress to history
  const saveProgress = useCallback(() => {
    const curTime = player ? player.currentTime : currentTimeRef.current
    const dur = player && player.duration > 0 ? player.duration : durationRef.current
    if (curTime <= 0) return
    const progressRatio = dur > 0 ? curTime / dur : 0
    addToHistory({
      movieId: infoHash,
      contentKey: infoHash,
      contentType: isSeries ? 'episode' : 'movie',
      seriesTitle,
      seasonNumber,
      episodeNumber,
      slug: infoHash,
      title,
      poster: posterUrl || '',
      progress: progressRatio,
      currentTime: curTime,
      duration: dur,
      magnetURI: magnetURI || `magnet:?xt=urn:btih:${infoHash}`
    })
  }, [player, infoHash, isSeries, seriesTitle, seasonNumber, episodeNumber, title, posterUrl, magnetURI, addToHistory])

  useEffect(() => {
    progressTimer.current = setInterval(saveProgress, 10000)
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current)
      saveProgress()
    }
  }, [saveProgress])

  // 8. Auto-hide controls
  const resetControlsTimer = () => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    setShowControls(true)
    controlsTimer.current = setTimeout(() => {
      setShowControls(false)
    }, 4500)
  }

  useEffect(() => {
    resetControlsTimer()
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current)
    }
  }, [])

  const toggleControls = () => {
    if (showControls) {
      setShowControls(false)
      if (controlsTimer.current) clearTimeout(controlsTimer.current)
    } else {
      resetControlsTimer()
    }
  }

  const handleSkip = (seconds: number) => {
    resetControlsTimer()
    if (player) {
      player.seekBy(seconds)
    }
  }

  const handlePlayPause = () => {
    resetControlsTimer()
    if (!player) return
    if (player.playing) {
      player.pause()
    } else {
      player.play()
    }
  }

  const handleScrubberPress = (e: any) => {
    if (trackWidth > 0 && duration > 0 && player) {
      const { locationX } = e.nativeEvent
      const ratio = Math.max(0, Math.min(1, locationX / trackWidth))
      const targetTime = Math.round(ratio * duration)
      player.currentTime = targetTime
      setCurrentTime(targetTime)
      resetControlsTimer()
    }
  }

  const handleBack = () => {
    if (player) {
      player.pause()
    }
    saveProgress()
    navigation.goBack()
  }

  const retryPlayback = () => {
    setPlaybackError(null)
    setIsBuffering(true)
    if (isDirectStream && initialStreamURL) {
      try {
        player.replace(initialStreamURL)
        player.play()
      } catch {}
    } else {
      setRetryNonce((value) => value + 1)
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Touch surface */}
      <TouchableOpacity
        style={styles.playerTouchArea}
        activeOpacity={1}
        onPress={toggleControls}
      >
        {/* Native Video Surface */}
        <View style={styles.videoSurface}>
          <VideoView
            style={styles.videoPlayer}
            player={player}
            contentFit="contain"
            nativeControls={false}
          />

          {isBuffering ? (
            <View style={styles.bufferBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.bufferText}>Buffering stream pieces from swarm...</Text>
            </View>
          ) : null}

          {playbackError ? (
            <View style={styles.bufferBox}>
              <Text style={styles.errorTitle}>Playback unavailable</Text>
              <Text style={styles.bufferText}>{playbackError}</Text>
              <TouchableOpacity style={styles.errorButton} onPress={retryPlayback}>
                <Text style={styles.errorButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Subtitle Overlay */}
          {activeCue ? (
            <View style={styles.subtitleContainer}>
              <Text style={styles.subtitleText}>{activeCue}</Text>
            </View>
          ) : null}
        </View>

        {/* Controls Overlay */}
        {showControls ? (
          <View
            style={[
              styles.controlsOverlay,
              {
                paddingTop: Math.max(insets.top, 16),
                paddingBottom: Math.max(insets.bottom, 16),
                paddingLeft: Math.max(insets.left, 16),
                paddingRight: Math.max(insets.right, 16)
              }
            ]}
          >
            {/* Top Bar */}
            <View style={styles.topBar}>
              <TouchableOpacity onPress={handleBack} style={styles.iconBtn}>
                <ArrowLeft size={24} color="#ffffff" />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.playerTitle} numberOfLines={1}>
                  {title}
                </Text>
                {/* Swarm Health Badge */}
                <View style={styles.swarmHealthRow}>
                  <View style={styles.healthItem}>
                    <Users size={12} color={colors.success} />
                    <Text style={[styles.healthText, { color: colors.success }]}>
                      {streamInfo.peers} peers
                    </Text>
                  </View>
                  <View style={styles.healthItem}>
                    <HardDrive size={12} color={colors.primary} />
                    <Text style={styles.healthText}>{streamInfo.speed}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Center Playback Buttons */}
            <View style={styles.centerControls}>
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={() => handleSkip(-10)}
              >
                <RotateCcw size={28} color="#ffffff" />
                <Text style={styles.skipText}>10s</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.playPauseBtn}
                onPress={handlePlayPause}
              >
                {isPlaying ? (
                  <Pause size={36} color="#ffffff" fill="#ffffff" />
                ) : (
                  <Play size={36} color="#ffffff" fill="#ffffff" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.skipBtn}
                onPress={() => handleSkip(10)}
              >
                <RotateCw size={28} color="#ffffff" />
                <Text style={styles.skipText}>10s</Text>
              </TouchableOpacity>
            </View>

            {/* Bottom Scrubber & Time */}
            <View style={styles.bottomBar}>
              <Text style={styles.timeText}>{formatDuration(currentTime)}</Text>
              {/* Timeline scrubber bar */}
              <TouchableOpacity
                style={styles.scrubberTrack}
                activeOpacity={1}
                onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
                onPress={handleScrubberPress}
              >
                <View
                  style={[
                    styles.scrubberFill,
                    { width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }
                  ]}
                />
              </TouchableOpacity>
              <Text style={styles.timeText}>{formatDuration(duration)}</Text>
            </View>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000'
  },
  playerTouchArea: {
    flex: 1,
    position: 'relative'
  },
  videoSurface: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    position: 'relative'
  },
  videoPlayer: {
    width: '100%',
    height: '100%'
  },
  bufferBox: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12
  },
  bufferText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 12
  },
  subtitleContainer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    alignItems: 'center'
  },
  subtitleText: {
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center'
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'space-between',
    padding: 16
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  iconBtn: {
    padding: 8
  },
  playerTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700'
  },
  swarmHealthRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 3
  },
  healthItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  healthText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600'
  },
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 48
  },
  skipBtn: {
    alignItems: 'center',
    padding: 8
  },
  skipText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4
  },
  playPauseBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8
  },
  timeText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'monospace'
  },
  scrubberTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden'
  },
  scrubberFill: {
    height: '100%',
    backgroundColor: colors.primary
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center'
  },
  errorSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center'
  },
  errorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8
  },
  errorButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600'
  }
})
