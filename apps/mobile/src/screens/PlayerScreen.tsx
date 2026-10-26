import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  AppState,
  Modal,
  ScrollView,
  FlatList
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
import { useUserDataStore, usePlaybackSettingsStore, getAuthGeneration } from '@streamforge/core/stores'
import { formatDuration } from '@streamforge/core/utils'
import { TrackControls } from '../components/player/TrackControls'
import { SeekBar } from '../components/player/SeekBar'
import { mobileTorrentAPI, beginMobilePlayback, selectMobileFile } from '../native/torrent-engine'
import type { PlaybackAttempt, SessionInfo } from '../playback/session-manager'
import { flushMobileStorage } from '../storage/mobile-storage'
import { acceptsPlayerStatus } from '../playback/player-event-policy'

type Props = NativeStackScreenProps<RootStackParamList, 'Player'>

export const PlayerScreen = ({ navigation, route }: Props) => {
  if (!route.params?.infoHash) {
    return <InvalidPlaybackRequest navigation={navigation} />
  }
  return <PlayerContent key={`${route.key}:${route.params.infoHash}:${route.params.episodeNumber ?? 0}:${route.params.fileIndex ?? -1}`} navigation={navigation} route={route} />
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
  const [fileChoice, setFileChoice] = useState<SessionInfo | null>(null)
  const attemptRef = useRef<PlaybackAttempt | null>(null)
  const sourceOwnerRef = useRef<PlaybackAttempt | null>(null)
  const sourceActiveRef = useRef(false)
  const selectedFileRef = useRef(fileIndex)
  const resumePendingRef = useRef(initialTime || 0)
  const accountGenerationRef = useRef(getAuthGeneration())
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(initialTime || 0)
  const [duration, setDuration] = useState(initialDuration || 0)
  const [showControls, setShowControls] = useState(true)
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [fitMenu, setFitMenu] = useState(false)
  const [infoMenu, setInfoMenu] = useState(false)
  const interactionRef = useRef(false)
  const [startupStage, setStartupStage] = useState('Discovering torrent metadata…')
  const startedAt = useRef(0)
  const [diagnostics, setDiagnostics] = useState({ metadataMs: 0, sourceMs: 0, firstFrameMs: 0, bufferingCount: 0 })
  const firstFrame = useRef(false)
  const [streamInfo, setStreamInfo] = useState({
    firstVideoByteMs: 0,
    peers: 0,
    speed: '0.0 MiB/s',
    buffered: 0
  })
  const [isBuffering, setIsBuffering] = useState(true)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)

  const controlsTimer = useRef<NodeJS.Timeout | null>(null)
  const progressTimer = useRef<NodeJS.Timeout | null>(null)
  const currentTimeRef = useRef(initialTime || 0)
  const durationRef = useRef(initialDuration || 0)
  const lastSavedProgress = useRef<string | null>(null)

  const addToHistory = useUserDataStore((s) => s.addToHistory)
  const playbackSettings = usePlaybackSettingsStore()

  // 1. Initialize native video player via expo-video
  const player = useVideoPlayer(null, (p) => {
    p.loop = false
    // expo-video does not emit timeUpdate events when this is zero.
    p.timeUpdateEventInterval = 0.5
    p.staysActiveInBackground = false
    p.audioMixingMode = 'doNotMix'
  })

  const syncReadyState = useCallback(() => {
    if (player.status !== 'readyToPlay') return
    setIsBuffering(false)
    setDiagnostics(value => ({ ...value, sourceMs: value.sourceMs || Date.now() - startedAt.current }))
    if (player.duration > 0) {
      durationRef.current = player.duration
      setDuration(player.duration)
      if (resumePendingRef.current > 0) {
        player.currentTime = Math.min(resumePendingRef.current, Math.max(0, player.duration - 1))
        currentTimeRef.current = player.currentTime
        resumePendingRef.current = 0
      }
    }
  }, [player])

  // 2. Lock to landscape while inside player, return to portrait on exit
  useEffect(() => {
    let active = true
    const previous = ScreenOrientation.getOrientationLockAsync()
    void previous.then(() => {
      if (active) return ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
    }).catch(() => {})
    return () => {
      active = false
      void previous.then(lock => ScreenOrientation.lockAsync(lock)).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!isBuffering || fileChoice) return
    const timeout = setTimeout(() => {
      player.pause()
      setPlaybackError('The stream did not provide video data. Retry or choose another source.')
      setIsBuffering(false)
      void attemptRef.current?.close().catch(() => {})
    }, 60_000)
    return () => clearTimeout(timeout)
  }, [isBuffering, player, retryNonce, fileChoice])

  // A unique attempt owns setup and cleanup, including retries of the same URL.
  useEffect(() => {
    let active = true
    let attempt: PlaybackAttempt | null = null
    sourceActiveRef.current = false
    sourceOwnerRef.current = null
    startedAt.current = Date.now(); firstFrame.current = false
    setStreamInfo({ firstVideoByteMs: 0, peers: 0, speed: '0.0 MiB/s', buffered: 0 })
    setDiagnostics({ metadataMs: 0, sourceMs: 0, firstFrameMs: 0, bufferingCount: 0 })
    setStartupStage(isDirectStream ? 'Opening video…' : 'Discovering torrent metadata…')
    setSession(null)
    setPlaybackError(null)
    setFileChoice(null)
    setIsBuffering(true)
    resumePendingRef.current = currentTimeRef.current

    const load = async (url: string) => {
      sourceOwnerRef.current = attempt
      setStartupStage('Fetching video data and preparing playback…')
      await player.replaceAsync(url)
      if (!active) return
      sourceActiveRef.current = true
      if (player.status === 'error') throw new Error('The video player could not open this stream')
      syncReadyState()
      if (AppState.currentState === 'active') player.play()
    }
    const resolve = async () => {
      if (isDirectStream && initialStreamURL) {
        if (!initialStreamURL.toLowerCase().startsWith('https://')) throw new Error('Direct playback requires an HTTPS video URL')
        await load(initialStreamURL)
      } else if (magnetURI) {
        attempt = beginMobilePlayback(magnetURI, {
          seasonNumber: seasonNumber ?? 0, episodeNumber: episodeNumber ?? 0,
          ...(selectedFileRef.current !== undefined ? { fileIndex: selectedFileRef.current } : {})
        })
        attemptRef.current = attempt
        const info = await attempt.result
        if (!active) return
        setSession(info)
        setDiagnostics(value => ({ ...value, metadataMs: Date.now() - startedAt.current }))
        if (info.requiresFileSelection) {
          setIsBuffering(false)
          setFileChoice(info)
        } else {
          selectedFileRef.current = info.selectedFileIndex
          await load(info.streamURL)
        }
      } else {
        throw new Error('This history entry has no saved source. Choose a source again from its details page.')
      }
    }
    void resolve().catch(error => {
      if (active) {
        setPlaybackError(error instanceof Error ? error.message : 'Unable to start playback'); setIsBuffering(false)
        void attempt?.close().catch(() => {})
      }
    })
    const progress = mobileTorrentAPI.onTorrentProgress(data => {
      if (active && data.infoHash === infoHash) setStreamInfo({
        firstVideoByteMs: data.firstVideoByteMs ?? 0, peers: data.numPeers, speed: `${(data.downloadSpeed / (1024 * 1024)).toFixed(1)} MiB/s`, buffered: data.progress
      })
    })
    const errors = mobileTorrentAPI.onTorrentError(data => {
      if (active && data.infoHash === infoHash) {
        player.pause(); setPlaybackError(data.error); setIsBuffering(false)
      }
    })
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') return
      player.pause()
      if (attempt) {
        void attempt.close().catch(() => {})
        setPlaybackError('Playback stopped while the app was in the background. Tap Retry to resume.')
        setIsBuffering(false)
      }
    })
    return () => {
      active = false
      sourceActiveRef.current = false
      sourceOwnerRef.current = null
      progress(); errors(); appState.remove()
      if (attemptRef.current === attempt) attemptRef.current = null
      void attempt?.close().catch(() => {})
    }
  }, [infoHash, magnetURI, isDirectStream, initialStreamURL, seasonNumber, episodeNumber, retryNonce, player, syncReadyState])

  const chooseVideoFile = async (index: number) => {
    const attempt = attemptRef.current
    if (!attempt || !fileChoice) return
    setIsBuffering(true)
    setFileChoice(null)
    try {
      const info = await selectMobileFile(attempt.id, index)
      if (attemptRef.current !== attempt) return
      setSession(info)
      selectedFileRef.current = index
      sourceOwnerRef.current = attempt
      sourceActiveRef.current = false
      await player.replaceAsync(info.streamURL)
      if (attemptRef.current !== attempt) return
      sourceActiveRef.current = true
      if (player.status === 'error') throw new Error('The video player could not open this file')
      syncReadyState()
      if (AppState.currentState === 'active') player.play()
    } catch (error) {
      if (attemptRef.current === attempt) {
        setPlaybackError(error instanceof Error ? error.message : 'Unable to select this file')
        setIsBuffering(false)
      }
    }
  }

  // 5. Subscribe to real native player events (replaces simulated interval clock)
  useEffect(() => {
    if (!player) return

    const subPlaying = player.addListener('playingChange', (event) => {
      setIsPlaying(player.playing)
    })

    const subStatus = player.addListener('statusChange', (event) => {
      if (!acceptsPlayerStatus(sourceActiveRef.current, event.status, player.status)) return
      if (event.status === 'loading') {
        if (firstFrame.current) { setStartupStage('Buffering video…'); setDiagnostics(value => ({ ...value, bufferingCount: value.bufferingCount + 1 })) }
        setIsBuffering(true)
      } else if (event.status === 'readyToPlay') {
        setDiagnostics(value => ({ ...value, sourceMs: value.sourceMs || Date.now() - startedAt.current }))
        syncReadyState()
      } else if (event.status === 'error') {
        setPlaybackError('The video player could not open this stream.')
        setIsBuffering(false)
        void sourceOwnerRef.current?.close().catch(() => {})
      }
    })

    const subTime = player.addListener('timeUpdate', (event) => {
      if (!sourceActiveRef.current || player.status !== 'readyToPlay' || !Number.isFinite(event.currentTime)) return
      if (resumePendingRef.current > 0 && player.duration > 0) { syncReadyState(); return }
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
  }, [player, syncReadyState])

  // 7. Save watch progress to history
  const saveProgress = useCallback(() => {
    const curTime = currentTimeRef.current
    const dur = durationRef.current
    if (accountGenerationRef.current !== getAuthGeneration() || !Number.isFinite(curTime) || curTime <= 0) return
    const checkpoint = JSON.stringify([getAuthGeneration(), params.contentKey, infoHash, selectedFileRef.current, curTime, dur, magnetURI, initialStreamURL])
    if (lastSavedProgress.current === checkpoint) return
    const progressRatio = dur > 0 ? Math.max(0, Math.min(1, curTime / dur)) : 0
    addToHistory({
      movieId: infoHash,
      contentKey: params.contentKey || (isSeries ? `episode:${seriesTitle || infoHash}:${seasonNumber || 0}:${episodeNumber || 0}` : `magnet:${infoHash}`),
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
      magnetURI: magnetURI || '',
      fileIndex: selectedFileRef.current,
      streamURL: isDirectStream ? initialStreamURL : undefined
    })
    lastSavedProgress.current = checkpoint
  }, [infoHash, isSeries, seriesTitle, seasonNumber, episodeNumber, title, posterUrl, magnetURI, addToHistory, params.contentKey, isDirectStream, initialStreamURL])

  useEffect(() => {
    progressTimer.current = setInterval(saveProgress, 10000)
    const background = AppState.addEventListener('change', state => {
      if (state !== 'active') { saveProgress(); void flushMobileStorage().catch(() => {}) }
    })
    return () => {
      background.remove()
      if (progressTimer.current) clearInterval(progressTimer.current)
      saveProgress()
      void flushMobileStorage().catch(() => {})
    }
  }, [saveProgress])

  // 8. Auto-hide controls
  const resetControlsTimer = () => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    setShowControls(true)
    controlsTimer.current = setTimeout(() => {
      if (!interactionRef.current) setShowControls(false)
    }, 4500)
  }

  useEffect(() => {
    resetControlsTimer()
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current)
    }
  }, [])

  const onInteraction = useCallback((active: boolean) => {
    interactionRef.current = active
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    setShowControls(true)
    if (!active) controlsTimer.current = setTimeout(() => { if (!interactionRef.current) setShowControls(false) }, 4500)
  }, [])

  const toggleControls = () => {
    if (interactionRef.current) return
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
    if (playbackError) { retryPlayback(); return }
    if (fileChoice) return
    if (!player) return
    if (player.playing) {
      player.pause()
    } else {
      player.play()
    }
  }

  const handleSeek = (targetTime: number) => {
    if (!sourceActiveRef.current || duration <= 0 || player.status !== 'readyToPlay') return
    player.currentTime = Math.max(0, Math.min(duration, targetTime))
    currentTimeRef.current = player.currentTime
    setCurrentTime(player.currentTime)
    resetControlsTimer()
  }

  const handleBack = () => {
    if (player) {
      player.pause()
    }
    saveProgress()
    navigation.goBack()
  }

  const retryPlayback = () => { setRetryNonce(value => value + 1) }

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      <Modal visible={fileChoice !== null} transparent onRequestClose={handleBack}>
        <View style={[styles.errorContainer, { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', padding: 24 }]}>
          <Text style={styles.errorTitle}>Choose a video file</Text>
          <FlatList
            data={fileChoice?.files.filter(file => file.type === 'video') || []}
            keyExtractor={file => String(file.index)}
            renderItem={({ item }) => <TouchableOpacity onPress={() => { void chooseVideoFile(item.index) }} style={{ paddingVertical: 16 }} accessibilityRole="button">
              <Text style={{ color: '#ffffff' }}>{item.path}</Text>
              <Text style={{ color: colors.textSecondary }}>{(item.size / 1048576).toFixed(0)} MiB</Text>
            </TouchableOpacity>}
          />
          <TouchableOpacity onPress={handleBack} style={{ padding: 16 }}><Text style={{ color: '#ffffff' }}>Cancel</Text></TouchableOpacity>
        </View>
      </Modal>

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
            contentFit={playbackSettings.videoFit}
            onFirstFrameRender={() => {
              if (!sourceActiveRef.current || firstFrame.current) return
              firstFrame.current = true
              setDiagnostics(value => ({ ...value, firstFrameMs: Date.now() - startedAt.current }))
            }}
            nativeControls={false}
          />

          {isBuffering ? (
            <View style={styles.bufferBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text accessibilityLiveRegion="polite" style={styles.bufferText}>{startupStage}</Text>
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
              <View style={{ flex: 1, marginLeft: 12, marginRight: 300 }}>
                <Text style={styles.playerTitle} numberOfLines={1}>
                  {title}
                </Text>
                {/* Swarm Health Badge */}
                <View style={styles.swarmHealthRow}>
                  <View style={styles.healthItem}>
                    <Users size={12} color={colors.success} />
                    <Text style={[styles.healthText, { color: colors.success }]}>
                      {streamInfo.peers} connected peers
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
                accessibilityRole="button" accessibilityLabel="Back ten seconds"
                onPress={() => handleSkip(-10)}
              >
                <RotateCcw size={28} color="#ffffff" />
                <Text style={styles.skipText}>10s</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.playPauseBtn}
                accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
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
                accessibilityRole="button" accessibilityLabel="Forward ten seconds"
                onPress={() => handleSkip(10)}
              >
                <RotateCw size={28} color="#ffffff" />
                <Text style={styles.skipText}>10s</Text>
              </TouchableOpacity>
            </View>

            {/* Bottom Scrubber & Time */}
            <View style={styles.bottomBar}>
              <Text style={styles.timeText}>{formatDuration(currentTime)}</Text>
              <SeekBar currentTime={currentTime} duration={duration} onSeek={handleSeek} onInteraction={onInteraction} />
              <Text style={styles.timeText}>{formatDuration(duration)}</Text>
            </View>
          </View>
        ) : null}
      </TouchableOpacity>
      <TrackControls key={`${session?.sessionId || retryNonce}:${session?.selectedFileIndex ?? -1}`} player={player} session={session} currentTime={currentTime} controlsVisible={showControls} title={title} onOpenChange={onInteraction} />
      {showControls ? <View style={{ position: 'absolute', top: 20, right: 132, flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Video screen size" onPress={() => { setFitMenu(true); onInteraction(true) }} style={styles.menuButton}><Text style={{ color: '#fff' }}>Screen</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Stream information" onPress={() => { setInfoMenu(true); onInteraction(true) }} style={styles.menuButton}><Text style={{ color: '#fff' }}>Info</Text></TouchableOpacity>
      </View> : null}
      <Modal visible={infoMenu} transparent supportedOrientations={['landscape', 'portrait']} onRequestClose={() => { setInfoMenu(false); onInteraction(false) }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 32 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 20 }}>Stream information</Text>
          <Text style={{ color: '#fff', paddingVertical: 16 }}>{streamInfo.peers} connected peers | {streamInfo.speed}{'\n'}Metadata: {diagnostics.metadataMs ? `${(diagnostics.metadataMs / 1000).toFixed(1)}s` : 'pending / not applicable'}{'\n'}First video data (native session): {streamInfo.firstVideoByteMs ? `${(streamInfo.firstVideoByteMs / 1000).toFixed(1)}s` : 'pending / not applicable'}{'\n'}Player ready: {diagnostics.sourceMs ? `${(diagnostics.sourceMs / 1000).toFixed(1)}s` : 'pending'}{'\n'}First picture: {diagnostics.firstFrameMs ? `${(diagnostics.firstFrameMs / 1000).toFixed(1)}s` : 'pending'}{'\n'}Buffering events after first picture: {diagnostics.bufferingCount}</Text>
          <Text style={{ color: colors.textSecondary }}>Reported seeders describe the source listing. Connected peers are the current connections used by this phone.</Text>
          <TouchableOpacity style={styles.menuButton} onPress={() => { setInfoMenu(false); onInteraction(false) }}><Text style={{ color: '#fff' }}>Done</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={fitMenu} transparent supportedOrientations={['landscape', 'portrait']} onRequestClose={() => { setFitMenu(false); onInteraction(false) }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 32 }}>
          {([['contain', 'Fit — complete picture'], ['cover', 'Fill / crop — edges may be cropped'], ['fill', 'Stretch — picture may look distorted']] as const).map(([value, label]) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: playbackSettings.videoFit === value }} style={styles.menuButton} onPress={() => { playbackSettings.updateSettings({ videoFit: value }); setFitMenu(false); onInteraction(false) }}><Text style={{ color: '#fff' }}>{label}</Text></TouchableOpacity>)}
          <TouchableOpacity style={styles.menuButton} onPress={() => { setFitMenu(false); onInteraction(false) }}><Text style={{ color: '#fff' }}>Cancel</Text></TouchableOpacity>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  menuButton: { minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 8, marginVertical: 4 },
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
    padding: 8,
    minHeight: 48,
    minWidth: 48
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
    paddingHorizontal: 8,
    // Reserve the lower caption band used by the native subtitle renderer.
    marginBottom: 56
  },
  timeText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'monospace'
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
