import React from 'react'
import { TouchableOpacity, Image, Text, View, StyleSheet } from 'react-native'
import { Star } from 'lucide-react-native'
import { colors } from '../../theme/colors'

interface MediaCardProps {
  title: string
  posterUrl?: string | null
  year?: number | string | null
  rating?: number | null
  onPress: () => void
  width?: number
  aspectRatio?: number
}

export const MediaCard: React.FC<MediaCardProps> = ({
  title,
  posterUrl,
  year,
  rating,
  onPress,
  width = 110,
  aspectRatio = 2 / 3
}) => {
  return (
    <TouchableOpacity
      style={[styles.container, { width }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.posterContainer, { height: width / aspectRatio }]}>
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            style={styles.poster}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText} numberOfLines={2}>
              {title}
            </Text>
          </View>
        )}
        {rating !== undefined && rating !== null && rating > 0 ? (
          <View style={styles.ratingBadge}>
            <Star size={10} color="#fbbf24" fill="#fbbf24" />
            <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {year ? <Text style={styles.year}>{year}</Text> : null}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    marginRight: 12,
    marginBottom: 16
  },
  posterContainer: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surfaceLight,
    position: 'relative'
  },
  poster: {
    width: '100%',
    height: '100%'
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    backgroundColor: colors.surface
  },
  placeholderText: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500'
  },
  ratingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3
  },
  ratingText: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '700'
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6
  },
  year: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2
  }
})
