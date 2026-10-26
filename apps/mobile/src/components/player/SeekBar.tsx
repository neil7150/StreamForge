import React, { useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { formatDuration } from '@streamforge/core/utils'
import { seekTarget } from '../../playback/control-policy'
import { colors } from '../../theme/colors'

export function SeekBar({ currentTime, duration, onSeek, onInteraction }: {
  currentTime: number; duration: number; onSeek: (time: number) => void; onInteraction: (active: boolean) => void
}) {
  const width = useRef(0)
  const target = useRef<number | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const update = (x: number) => { target.current = seekTarget(x, width.current, duration); setPreview(target.current) }
  const release = (commit: boolean) => {
    if (commit && target.current !== null) onSeek(target.current)
    target.current = null; setPreview(null); onInteraction(false)
  }
  const ratio = duration > 0 ? Math.max(0, Math.min(1, (preview ?? currentTime) / duration)) : 0
  return <View style={{ flex: 1 }}>
    {preview !== null ? <Text style={{ color: '#fff', textAlign: 'center', position: 'absolute', bottom: 44, alignSelf: 'center' }}>{formatDuration(preview)}</Text> : null}
    <View accessibilityRole="adjustable" accessibilityLabel="Playback position" accessibilityValue={{ min: 0, max: Math.max(0, duration), now: Math.max(0, Math.min(duration, currentTime)), text: formatDuration(preview ?? currentTime) }}
      accessibilityState={{ disabled: duration <= 0 }} accessibilityActions={[{ name: 'increment', label: 'Forward ten seconds' }, { name: 'decrement', label: 'Back ten seconds' }]}
      onAccessibilityAction={event => { if (duration > 0) onSeek(Math.max(0, Math.min(duration, currentTime + (event.nativeEvent.actionName === 'increment' ? 10 : -10)))) }}
      style={{ height: 48, justifyContent: 'center' }} onLayout={event => { width.current = event.nativeEvent.layout.width }}
      onStartShouldSetResponder={() => duration > 0}
      onResponderGrant={event => { onInteraction(true); update(event.nativeEvent.locationX) }}
      onResponderMove={event => update(event.nativeEvent.locationX)} onResponderRelease={() => release(true)} onResponderTerminate={() => release(false)} onResponderTerminationRequest={() => false}>
      <View pointerEvents="none" style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' }}>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.primary, width: `${ratio * 100}%` }} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', left: `${ratio * 100}%`, marginLeft: -8, height: 16, width: 16, borderRadius: 8, backgroundColor: '#fff' }} />
    </View>
  </View>
}
