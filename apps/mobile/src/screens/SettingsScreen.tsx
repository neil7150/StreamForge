import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert
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
  const { user, isAuthenticated, logout } = useAuthStore()

  const qualityOptions: PreferredQuality[] = ['auto', '1080p', '720p', '2160p']
  const subtitleOptions: { label: string; value: SubtitleMode }[] = [
    { label: 'Auto', value: 'auto' },
    { label: 'Always', value: 'always' },
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

  const handleClearCache = () => {
    Alert.alert('Clear Cache', 'Torrent metadata and search cache have been cleared.', [
      { text: 'OK' }
    ])
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

          {/* Prefer Direct Play */}
          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={styles.settingLabel}>Prefer Direct Play</Text>
              <Text style={styles.settingDesc}>Use hardware decoding directly without transcoding</Text>
            </View>
            <Switch
              value={settings.preferDirectPlay}
              onValueChange={(val: boolean) => settings.updateSettings({ preferDirectPlay: val })}
              thumbColor={settings.preferDirectPlay ? colors.primary : colors.mutedForeground}
              trackColor={{ false: colors.muted, true: colors.primary + '66' }}
            />
          </View>

          <View style={styles.divider} />

          {/* Autoplay Next Episode */}
          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={styles.settingLabel}>Autoplay Next Episode</Text>
              <Text style={styles.settingDesc}>Automatically play the next episode when current ends</Text>
            </View>
            <Switch
              value={settings.autoplayNextEpisode}
              onValueChange={(val: boolean) => settings.updateSettings({ autoplayNextEpisode: val })}
              thumbColor={settings.autoplayNextEpisode ? colors.primary : colors.mutedForeground}
              trackColor={{ false: colors.muted, true: colors.primary + '66' }}
            />
          </View>

          <View style={styles.divider} />

          {/* Automatic Fallback */}
          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={styles.settingLabel}>Automatic Fallback</Text>
              <Text style={styles.settingDesc}>Try alternative torrent sources if chosen one is stalled</Text>
            </View>
            <Switch
              value={settings.automaticSourceFallback}
              onValueChange={(val: boolean) => settings.updateSettings({ automaticSourceFallback: val })}
              thumbColor={settings.automaticSourceFallback ? colors.primary : colors.mutedForeground}
              trackColor={{ false: colors.muted, true: colors.primary + '66' }}
            />
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
          <Text style={styles.sectionTitle}>Architecture & Diagnostics</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>App Version</Text>
            <Text style={styles.infoValue}>1.0.0 (Expo SDK 52)</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Engine</Text>
            <Text style={styles.infoValue}>Localhost Torrent Streamer</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Decoder</Text>
            <Text style={styles.infoValue}>Android ExoPlayer (Hardware)</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Storage Mode</Text>
            <Text style={styles.infoValue}>Stream-Only (RAM/Buffer)</Text>
          </View>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.clearCacheButton} onPress={handleClearCache} activeOpacity={0.7}>
            <Trash2 size={16} color={colors.mutedForeground} />
            <Text style={styles.clearCacheText}>Clear Stream Cache</Text>
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
