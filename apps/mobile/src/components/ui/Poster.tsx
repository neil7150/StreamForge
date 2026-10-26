import React, { useState } from 'react'
import { Image, Text, View } from 'react-native'
import { colors } from '../../theme/colors'

/** A failed image must leave a useful, consistently sized placeholder. */
export function Poster({ uri, title }: { uri?: string | null; title: string }) {
  const [failedURI, setFailedURI] = useState<string | null>(null)
  return <View style={{ width: 56, height: 84, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surfaceLight, justifyContent: 'center' }}>
    {uri && failedURI !== uri
      ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel={`${title} poster`} onError={() => setFailedURI(uri)} />
      : <Text style={{ color: colors.textMuted, fontSize: 10, padding: 4, textAlign: 'center' }} numberOfLines={4}>{title}</Text>}
  </View>
}
