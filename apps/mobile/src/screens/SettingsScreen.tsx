import React, { useState, useCallback } from 'react'
import Constants from 'expo-constants'
import { useFocusEffect } from '@react-navigation/native'
import { mobileTorrentAPI } from '../native/torrent-engine'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  usePlaybackSettingsStore,
  useAuthStore,
  type PreferredQuality,
  type SubtitleMode
} from '@streamforge/core'
import { colors } from '../theme/colors'
import { flushMobileStorage } from '../storage/mobile-storage'
import type { RootStackParamList } from '../navigation/types'
import {
  User,
  PlaySquare,
  Globe,
  Info,
  LogOut,
  LogIn,
  Trash2
} from 'lucide-react-native'

export function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()

  const settings = usePlaybackSettingsStore()
  const [cacheBytes, setCacheBytes] = useState<number | null>(null)
  const [clearingCache, setClearingCache] = useState(false)
  const [subtitleKey, setSubtitleKey] = useState(settings.openSubtitlesApiKey)
  const [savingKey, setSavingKey] = useState(false)
  useFocusEffect(useCallback(() => {
    let active = true
    void mobileTorrentAPI.getCacheSize().then(size => { if (active) setCacheBytes(size) }).catch(() => { if (active) setCacheBytes(null) })
    return () => { active = false }
  }, []))
  const { user, isAuthenticated, logout } = useAuthStore()

  const qualityOptions: PreferredQuality[] = ['auto', '1080p', '720p', '2160p']
  const subtitleOptions: { label: string; value: SubtitleMode }[] = [
    { label: 'Auto', value: 'auto' },
    { label: 'Off', value: 'off' }
  ]
  const languageOptions = [
    { label: 'English', code: 'eng' },
    { label: 'Spanish', code: 'spa' },
    { label: 'French', code: 'fre' },
    { label: 'German', code: 'ger' },
    { label: 'Japanese', code: 'jpn' }
  ]

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout()
        }
      }
    ])
  }

  const handleClearCache = async () => {
    if (clearingCache) return
    setClearingCache(true)
    try {
      await mobileTorrentAPI.clearCache()
      setCacheBytes(await mobileTorrentAPI.getCacheSize())
      Alert.alert('Cache cleared', 'Temporary stream files have been removed.')
    } catch (error) {
      Alert.alert('Cache could not be cleared', error instanceof Error ? error.message : 'Please retry.')
    } finally { setClearingCache(false) }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
    >
      <Text style={styles.screenTitle}>Settings</Text>

      {/* Account Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <User size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Account</Text>
        </View>

        <View style={styles.card}>
          {isAuthenticated && user ? (
            <View>
              <Text style={styles.accountEmail}>{user.email}</Text>
              <Text style={styles.accountRole}>Status: {user.is_active ? 'Active' : 'Pending'}</Text>
              <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
                <LogOut size={16} color={colors.destructive} />
                <Text style={styles.logoutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.loginCardInner}>
              <Text style={styles.loginHint}>Sign in to sync your watch history and watchlist across devices.</Text>
              <TouchableOpacity
                style={styles.loginButton}
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.8}
              >
                <LogIn size={16} color="#FFFFFF" />
                <Text style={styles.loginButtonText}>Sign In / Register</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Playback Settings */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <PlaySquare size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Streaming & Playback</Text>
        </View>

        <View style={styles.card}>
          {/* Preferred Quality */}
          <Text style={styles.settingLabel}>Preferred Quality</Text>
          <View style={styles.chipRow}>
            {qualityOptions.map((q) => (
              <TouchableOpacity
                key={q}
                style={[styles.chip, settings.preferredQuality === q && styles.chipActive]}
                onPress={() => settings.updateSettings({ preferredQuality: q })}
              >
                <Text style={[styles.chipText, settings.preferredQuality === q && styles.chipTextActive]}>
                  {q.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.divider} />

          {/* Minimum Seeders */}
          <Text style={styles.settingLabel}>Minimum Seeders Filter</Text>
          <View style={styles.chipRow}>
            {[1, 3, 5, 10].map((seeders) => (
              <TouchableOpacity
                key={seeders}
                style={[styles.chip, settings.minimumSeeders === seeders && styles.chipActive]}
                onPress={() => settings.updateSettings({ minimumSeeders: seeders })}
              >
                <Text style={[styles.chipText, settings.minimumSeeders === seeders && styles.chipTextActive]}>
                  {seeders}+
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Subtitles & Audio */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Globe size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Subtitles & Language</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.settingLabel}>Subtitle Display</Text>
          <Text style={styles.settingDesc}>Add your OpenSubtitles API key to enable online subtitles.</Text>
          <TextInput
            value={subtitleKey}
            onChangeText={setSubtitleKey}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="OpenSubtitles API key"
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="OpenSubtitles API key"
            style={{ color: colors.foreground, paddingVertical: 12 }}
          />
          <TouchableOpacity disabled={savingKey} style={{ paddingVertical: 12 }} onPress={() => {
            setSavingKey(true)
            settings.updateSettings({ openSubtitlesApiKey: subtitleKey.trim() })
            void flushMobileStorage().then(() => Alert.alert('Saved', 'Your subtitle key has been saved.'))
              .catch(() => Alert.alert('Could not save', 'Please retry before closing the app.'))
              .finally(() => setSavingKey(false))
          }} accessibilityRole="button">
            <Text style={{ color: colors.primary }}>{savingKey ? 'Saving…' : 'Save key'}</Text>
          </TouchableOpacity>
          <View style={styles.chipRow}>
            {subtitleOptions.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chip, settings.subtitleMode === opt.value && styles.chipActive]}
                onPress={() => settings.updateSettings({ subtitleMode: opt.value })}
              >
                <Text style={[styles.chipText, settings.subtitleMode === opt.value && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.divider} />

          <Text style={styles.settingLabel}>Preferred Subtitle Language</Text>
          <View style={styles.chipRow}>
            {languageOptions.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.chip, settings.preferredSubtitleLanguage === lang.code && styles.chipActive]}
                onPress={() => settings.updateSettings({ preferredSubtitleLanguage: lang.code })}
              >
                <Text style={[styles.chipText, settings.preferredSubtitleLanguage === lang.code && styles.chipTextActive]}>
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* App & Torrent Engine Info */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Info size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>App & Storage</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>App Version</Text>
            <Text style={styles.infoValue}>{Constants.expoConfig?.version || 'Unknown'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Engine</Text>
            <Text style={styles.infoValue}>Localhost Torrent Streamer</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Decoder</Text>
            <Text style={styles.infoValue}>Native video player</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Storage Mode</Text>
            <Text style={styles.infoValue}>Temporary disk cache</Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.settingDesc}>Cache: {cacheBytes === null ? 'Unavailable' : `${(cacheBytes / 1048576).toFixed(1)} MiB`}. Streaming stops if the 512 MiB cache limit is reached.</Text>
          <TouchableOpacity style={styles.clearCacheButton} onPress={() => { void handleClearCache() }} disabled={clearingCache} activeOpacity={0.7}>
            <Trash2 size={16} color={colors.mutedForeground} />
            <Text style={styles.clearCacheText}>{clearingCache ? 'Clearing…' : 'Clear Stream Cache'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    paddingHorizontal: 16
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.foreground,
    marginBottom: 20
  },
  section: {
    marginBottom: 24
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: 0.3
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border
  },
  accountEmail: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.foreground
  },
  accountRole: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 4,
    marginBottom: 14
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.destructive + '15',
    paddingVertical: 10,
    borderRadius: 10
  },
  logoutText: {
    color: colors.destructive,
    fontWeight: '600',
    fontSize: 14
  },
  loginCardInner: {
    alignItems: 'center',
    paddingVertical: 8
  },
  loginHint: {
    color: colors.mutedForeground,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8
  },
  settingDesc: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 2
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.mutedForeground
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700'
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 14
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  switchTextCol: {
    flex: 1,
    paddingRight: 16
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  infoLabel: {
    fontSize: 13,
    color: colors.mutedForeground
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.foreground
  },
  clearCacheButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  clearCacheText: {
    color: colors.mutedForeground,
    fontSize: 13,
    fontWeight: '600'
  }
})
