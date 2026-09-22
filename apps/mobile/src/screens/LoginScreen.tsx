import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuthStore } from '@streamforge/core'
import { colors } from '../theme/colors'
import type { RootStackParamList } from '../navigation/types'
import { ArrowLeft, Lock, Mail, Film } from 'lucide-react-native'

export function LoginScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()

  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const { login, register, isLoading, error, clearError } = useAuthStore()

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required', 'Please fill in all required fields.')
      return
    }

    if (isRegister && password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.')
      return
    }

    try {
      if (isRegister) {
        await register(email.trim(), password)
      } else {
        await login(email.trim(), password)
      }
      const authState = useAuthStore.getState()
      if (authState.isAuthenticated && !authState.error) {
        navigation.goBack()
      } else if (authState.error) {
        // The store caught the error — check if it's a network/connectivity issue
        const errMsg = authState.error.toLowerCase()
        if (errMsg.includes('network') || errMsg.includes('fetch') || errMsg.includes('failed') || errMsg.includes('timeout') || errMsg.includes('not configured')) {
          Alert.alert(
            'Backend Unavailable',
            'Cannot reach the StreamForge server. The auth backend is not running or is unreachable from this device.\n\nTo use auth, configure EXPO_PUBLIC_API_BASE_URL in your environment to point to a reachable server address (e.g., your PC\'s local IP).'
          )
        }
      }
    } catch {
      // Error is set in store — check for network issues
      const authState = useAuthStore.getState()
      const errMsg = (authState.error || '').toLowerCase()
      if (errMsg.includes('network') || errMsg.includes('fetch') || errMsg.includes('failed')) {
        Alert.alert(
          'Backend Unavailable',
          'Cannot reach the StreamForge server. Make sure the auth backend is running and reachable from this device.'
        )
      }
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={colors.foreground} />
        </TouchableOpacity>

        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Film size={36} color={colors.primary} />
          </View>
          <Text style={styles.brandTitle}>StreamForge</Text>
          <Text style={styles.brandSubtitle}>
            {isRegister ? 'Create your account to sync watchlist' : 'Welcome back to your personal cinema'}
          </Text>
        </View>

        <View style={styles.card}>
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Mail size={18} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="name@example.com"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={(text) => {
                  setEmail(text)
                  if (error) clearError()
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Lock size={18} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={(text) => {
                  setPassword(text)
                  if (error) clearError()
                }}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
          </View>

          {isRegister && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputWrapper}>
                <Lock size={18} color={colors.mutedForeground} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedForeground}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>
                {isRegister ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleText}>
              {isRegister ? 'Already have an account?' : "Don't have an account?"}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setIsRegister(!isRegister)
                if (error) clearError()
              }}
            >
              <Text style={styles.toggleLink}>
                {isRegister ? ' Sign In' : ' Register'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 32
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: colors.primary + '1A',
    borderWidth: 1,
    borderColor: colors.primary + '33',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.foreground,
    letterSpacing: -0.5
  },
  brandSubtitle: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 24
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border
  },
  errorBox: {
    backgroundColor: colors.destructive + '22',
    borderWidth: 1,
    borderColor: colors.destructive + '44',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  errorText: {
    color: colors.destructive,
    fontSize: 13,
    fontWeight: '500'
  },
  inputGroup: {
    marginBottom: 16
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12
  },
  inputIcon: {
    marginRight: 10
  },
  input: {
    flex: 1,
    height: 46,
    color: colors.foreground,
    fontSize: 15
  },
  submitButton: {
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8
  },
  submitButtonDisabled: {
    opacity: 0.6
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20
  },
  toggleText: {
    color: colors.mutedForeground,
    fontSize: 13
  },
  toggleLink: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700'
  }
})
