import React from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator
} from 'react-native'
import { X, Play, Zap, Users, HardDrive } from 'lucide-react-native'
import type { TorrentSearchResult } from '@streamforge/core/types'
import { colors } from '../../theme/colors'

interface SourcePickerModalProps {
  visible: boolean
  onClose: () => void
  onSelectSource: (source: TorrentSearchResult) => void
  sources: TorrentSearchResult[]
  isLoading: boolean
  error?: string
  title: string
}

export const SourcePickerModal: React.FC<SourcePickerModalProps> = ({
  visible,
  onClose,
  onSelectSource,
  sources,
  isLoading,
  title,
  error
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.subtitle}>
                {sources.length} torrent sources found
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Finding sources...</Text>
            </View>
          ) : sources.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{error || 'No torrent sources found.'}</Text>
            </View>
          ) : (
            <FlatList
              data={sources}
              keyExtractor={(item) => item.id || item.magnetURI}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.sourceItem}
                  onPress={() => onSelectSource(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.sourceMain}>
                    <Text style={styles.sourceName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <View style={styles.metaRow}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.provider}</Text>
                      </View>
                      <View style={styles.statItem}>
                        <HardDrive size={12} color={colors.textSecondary} />
                        <Text style={styles.statText}>{item.size}</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Users size={12} color={colors.success} />
                        <Text style={[styles.statText, { color: colors.success }]}>
                          {item.seeders} reported seeders
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.playIconContainer}>
                    <Play size={16} color="#ffffff" fill="#ffffff" />
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end'
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: colors.border
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: colors.border
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700'
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center'
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 12
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center'
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14
  },
  listContent: {
    padding: 12
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  sourceMain: {
    flex: 1,
    marginRight: 10
  },
  sourceName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8
  },
  badge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border
  },
  badgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '600'
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  statText: {
    color: colors.textSecondary,
    fontSize: 11
  },
  playIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center'
  }
})
