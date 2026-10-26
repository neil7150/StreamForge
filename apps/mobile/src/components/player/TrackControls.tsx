import React, { useEffect, useRef, useState } from 'react'
import { AppState, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import type { VideoPlayer, SubtitleTrack, AudioTrack } from 'expo-video'
import { openSubtitlesClient } from '@streamforge/core/clients'
import { findActiveSubtitleCue, parseSubtitles, type SubtitleCue } from '@streamforge/core/policies'
import { usePlaybackSettingsStore } from '@streamforge/core/stores'
import type { OnlineSubtitleResult } from '@streamforge/core/types'
import type { SessionInfo } from '../../playback/session-manager'
import { bundledSubtitles, matchesLanguage } from '../../playback/control-policy'
import { colors } from '../../theme/colors'

export function TrackControls({ player, session, currentTime, controlsVisible, title, onOpenChange }: {
  player: VideoPlayer; session: SessionInfo | null; currentTime: number; controlsVisible: boolean
  title: string; onOpenChange: (open: boolean) => void
}) {
  const settings = usePlaybackSettingsStore()
  const [open, setOpen] = useState(false)
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([])
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([])
  const [selected, setSelected] = useState('off')
  const [selectedAudio, setSelectedAudio] = useState('')
  const [cues, setCues] = useState<SubtitleCue[]>([])
  const [offset, setOffset] = useState(0)
  const [message, setMessage] = useState('')
  const [online, setOnline] = useState<OnlineSubtitleResult[]>([])
  const request = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const manualSubtitle = useRef(false)
  const manualAudio = useRef(false)
  useEffect(() => () => onOpenChange(false), [onOpenChange])
  const close = () => { setOpen(false); onOpenChange(false) }
  const clearRequest = () => { generation.current++; request.current?.abort(); request.current = null }

  useEffect(() => {
    manualSubtitle.current = false; manualAudio.current = false
    clearRequest(); setCues([]); setSelected('off'); setOffset(0); setMessage(''); setOnline([])
    const updateSubtitles = () => {
      const tracks = player.availableSubtitleTracks
      setSubtitleTracks(tracks)
      if (manualSubtitle.current) return
      const track = settings.subtitleMode === 'off' ? null
        : tracks.find(track => matchesLanguage(track.language, settings.preferredSubtitleLanguage))
          ?? (settings.subtitleMode === 'always' ? tracks[0] : null)
      player.subtitleTrack = track ?? null
      setSelected(track ? `embedded:${track.id}` : 'off')
    }
    const updateAudio = () => {
      const tracks = player.availableAudioTracks; setAudioTracks(tracks)
      if (!manualAudio.current) {
        const preferred = tracks.find(track => matchesLanguage(track.language, settings.preferredAudioLanguage))
        if (preferred) player.audioTrack = preferred
      }
      setSelectedAudio(player.audioTrack?.id || '')
    }
    const subs = player.addListener('availableSubtitleTracksChange', updateSubtitles)
    const audio = player.addListener('availableAudioTracksChange', updateAudio)
    const load = player.addListener('sourceLoad', () => { updateSubtitles(); updateAudio() })
    updateSubtitles(); updateAudio()
    const background = AppState.addEventListener('change', state => { if (state !== 'active') clearRequest() })
    return () => { clearRequest(); subs.remove(); audio.remove(); load.remove(); background.remove() }
  }, [player, session?.sessionId, session?.selectedFileIndex, settings.subtitleMode, settings.preferredSubtitleLanguage, settings.preferredAudioLanguage])

  const chooseEmbedded = (track: SubtitleTrack | null) => {
    clearRequest(); manualSubtitle.current = true; setCues([]); setOffset(0); setMessage('')
    try {
      player.subtitleTrack = track; setSelected(track ? `embedded:${track.id}` : 'off')
    } catch { setMessage('This subtitle track is unavailable. Choose another track or Off.') }
  }
  const loadText = async (key: string, getText: (signal: AbortSignal) => Promise<string>) => {
    clearRequest(); const id = generation.current
    const controller = new AbortController(); request.current = controller
    manualSubtitle.current = true; player.subtitleTrack = null; setCues([]); setSelected('off'); setOffset(0)
    setMessage('Loading subtitles…')
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      const content = await getText(controller.signal)
      if (id !== generation.current || controller.signal.aborted) return
      if (content.length > 2 * 1024 * 1024) throw new Error('Subtitle file is too large.')
      const parsed = parseSubtitles(content).filter(cue => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.start >= 0)
      if (!parsed.length) throw new Error('No readable subtitle cues were found.')
      setCues(parsed); setSelected(key); setMessage('')
    } catch (error) {
      if (id === generation.current) setMessage(controller.signal.aborted ? 'Subtitle loading timed out or was cancelled. Try again.' : error instanceof Error ? error.message : 'Unable to load subtitles.')
    } finally { clearTimeout(timeout) }
  }
  const searchOnline = async () => {
    clearRequest(); const id = generation.current; setMessage('Searching online subtitles…'); setOnline([])
    try {
      const results = await openSubtitlesClient.searchOnlineSubtitles({ apiKey: settings.openSubtitlesApiKey, query: title, language: settings.preferredSubtitleLanguage || 'eng' })
      if (id === generation.current) { setOnline(results.slice(0, 30)); setMessage(results.length ? '' : 'No online subtitles found.') }
    } catch { if (id === generation.current) setMessage('Online subtitle search failed. Check your key or connection.') }
  }
  const sidecars = session ? bundledSubtitles(session.files, session.selectedFileIndex) : []
  const cue = findActiveSubtitleCue(cues, currentTime, offset)
  const option = (label: string, active: boolean, action: () => void, key = label) => <TouchableOpacity key={key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={action} style={{ minHeight: 48, justifyContent: 'center', padding: 12, borderRadius: 8, backgroundColor: active ? colors.primary : colors.surfaceLight, marginBottom: 6 }}><Text style={{ color: '#fff' }}>{label}</Text></TouchableOpacity>
  return <>
    {cue ? <View pointerEvents="none" style={{ position: 'absolute', bottom: controlsVisible ? 160 : 32, left: 32, right: 32, alignItems: 'center' }}><Text style={{ fontSize: 20, textAlign: 'center', color: '#fff', backgroundColor: 'rgba(0,0,0,0.8)', padding: 8 }}>{cue.text}</Text></View> : null}
    {controlsVisible ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Subtitles and audio languages" onPress={() => { setOpen(true); onOpenChange(true) }} style={{ position: 'absolute', right: 24, top: 20, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 8 }}><Text style={{ color: '#fff', fontWeight: '700' }}>CC / Audio</Text></TouchableOpacity> : null}
    <Modal visible={open} transparent onRequestClose={close} supportedOrientations={['landscape', 'portrait']}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', padding: 24 }}>
        {option('Done', false, close)}
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <Text accessibilityRole="header" style={{ color: '#fff', fontSize: 20, marginVertical: 8 }}>Subtitles included with this video</Text>
          {message ? <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary, padding: 12 }}>{message}</Text> : null}
          {option('Off', selected === 'off', () => chooseEmbedded(null))}
          {subtitleTracks.map(track => option(track.label || track.language || 'Unknown language', selected === `embedded:${track.id}`, () => chooseEmbedded(track), `sub:${track.id}`))}
          {!subtitleTracks.length && !sidecars.length ? <Text style={{ color: colors.textSecondary, padding: 12 }}>{player.status === 'readyToPlay' ? 'No supported subtitles included. Some subtitle formats may not be supported by this player.' : 'Subtitle tracks appear when the video loads.'}</Text> : null}
          {sidecars.map(file => option(file.name, selected === `file:${file.index}`, () => {
            if (!session) return
            void loadText(`file:${file.index}`, async signal => {
              const url = new URL(session.streamURL)
              if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== `/stream/${session.sessionId}`) throw new Error('Invalid subtitle session.')
              url.pathname = `/subtitle/${session.sessionId}`; url.searchParams.set('index', String(file.index))
              const response = await fetch(url.toString(), { signal })
              if (!response.ok) throw new Error('Bundled subtitle unavailable. Try again.')
              return response.text()
            })
          }, `file:${file.index}`))}
          {cues.length ? <View><Text style={{ color: '#fff', padding: 12 }}>Subtitle delay: {offset.toFixed(1)}s</Text><View style={{ flexDirection: 'row', gap: 12 }}>{option('Earlier −0.5s', false, () => setOffset(value => Math.max(-30, value - 0.5)))}{option('Later +0.5s', false, () => setOffset(value => Math.min(30, value + 0.5)))}{option('Reset', false, () => setOffset(0))}</View></View> : null}
          <Text accessibilityRole="header" style={{ color: '#fff', fontSize: 20, marginVertical: 8 }}>Audio language</Text>
          {audioTracks.map(track => option(track.label || track.language || 'Unknown language', selectedAudio === track.id, () => {
            manualAudio.current = true
            try { player.audioTrack = track; setSelectedAudio(track.id || '') }
            catch { setMessage('This audio track is unavailable. Choose another track.') }
          }, `audio:${track.id}`))}
          {!audioTracks.length ? <Text style={{ color: colors.textSecondary, padding: 12 }}>Audio tracks appear when the video loads.</Text> : null}
          {settings.openSubtitlesApiKey ? <><Text style={{ color: '#fff', fontSize: 20, marginVertical: 8 }}>Optional online subtitles</Text>{option('Search OpenSubtitles', false, () => { void searchOnline() })}{online.map(result => option(result.release || result.language || 'Subtitle', false, () => { void loadText(`online:${result.fileId}`, () => openSubtitlesClient.downloadOnlineSubtitle(settings.openSubtitlesApiKey, result.fileId)) }, `online:${result.fileId}`))}</> : null}
        </ScrollView>
      </View>
    </Modal>
  </>
}
