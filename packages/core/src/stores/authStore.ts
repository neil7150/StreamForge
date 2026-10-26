import { create } from 'zustand'
import { api } from '../clients/api'
import { getStorageAdapter } from './storage-adapter'
import { useUserDataStore } from './userDataStore'
import { accountsEnabled, setAccountsEnabled } from './account-features'

export interface AuthUser {
  id: string
  email: string
  role: string
  email_verified: boolean
  is_active: boolean
}

export interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshAuth: () => Promise<boolean>
  loadSession: () => void
  setSession: (accessToken: string, refreshToken: string, user: AuthUser) => void
  loginWithOAuth: (provider: string) => Promise<void>
  clearError: () => void
}

let generation = 0
let refreshFlight: { generation: number; promise: Promise<boolean> } | null = null
export const getAuthGeneration = () => generation

function validUser(user: unknown): user is AuthUser {
  return !!user && typeof (user as AuthUser).id === 'string' && typeof (user as AuthUser).email === 'string'
}

function saveSession(accessToken: string, refreshToken: string, user: AuthUser) {
  const storage = getStorageAdapter()
  const entries: [string, string][] = [
    ['streamforge_access_token', accessToken], ['streamforge_refresh_token', refreshToken], ['streamforge_user', JSON.stringify(user)]
  ]
  if (storage.setItems) storage.setItems(entries)
  else for (const [key, value] of entries) storage.setItem(key, value)
}

function syncUserData(expected: number) {
  if (!accountsEnabled()) return
  void import('./userDataStore').then(({ useUserDataStore }) => {
    if (!accountsEnabled() || generation !== expected) return
    useUserDataStore.getState()._loadFromStorage()
    void useUserDataStore.getState().syncFromCloud()
  })
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null, isAuthenticated: false, isLoading: false, error: null,
  login: async (email, password) => {
    if (!accountsEnabled()) { set({ error: 'Accounts are not available in this build', isLoading: false }); return }
    const expected = ++generation
    set({ isLoading: true, error: null })
    try {
      const response = await api.login(email, password)
      if (expected !== generation) return
      const { access_token, refresh_token, user } = response.data
      get().setSession(access_token, refresh_token, user)
    } catch (error: any) {
      if (expected === generation) set({ error: error.message || 'Login failed', isLoading: false })
    }
  },
  register: async (email, password) => {
    if (!accountsEnabled()) { set({ error: 'Accounts are not available in this build', isLoading: false }); return }
    const expected = ++generation
    set({ isLoading: true, error: null })
    try {
      const response = await api.register(email, password) as any
      if (expected !== generation) return
      const { access_token, refresh_token, user } = response.data
      get().setSession(access_token, refresh_token, user)
    } catch (error: any) {
      if (expected === generation) set({ error: error.message || 'Registration failed', isLoading: false })
    }
  },
  logout: async () => {
    const expected = ++generation
    const storage = getStorageAdapter()
    const refreshToken = storage.getItem('streamforge_refresh_token')
    const revoke = accountsEnabled() && refreshToken ? api.logout(refreshToken).catch(() => {}) : Promise.resolve()
    const credentialKeys = ['streamforge_access_token', 'streamforge_refresh_token', 'streamforge_user']
    if (storage.removeItems) storage.removeItems(credentialKeys)
    else for (const key of credentialKeys) storage.removeItem(key)
    api.setToken(null)
    set({ user: null, isAuthenticated: false, isLoading: false, error: null })
    if (expected === generation) useUserDataStore.getState()._loadFromStorage()
    // Pending local changes remain account-scoped for the next sign-in. A logout
    // must not race an asynchronous upload into a different account or revoke it.
    await revoke
  },
  refreshAuth: () => {
    if (!accountsEnabled()) return Promise.resolve(false)
    const expected = generation
    if (refreshFlight?.generation === expected) return refreshFlight.promise
    const storage = getStorageAdapter()
    const refreshToken = storage.getItem('streamforge_refresh_token')
    if (!refreshToken) return Promise.resolve(false)
    const promise = (async () => {
      try {
        const response = await api.refresh(refreshToken)
        if (expected !== generation) return false
        const { access_token, refresh_token, user } = response.data
        if (!access_token || !refresh_token || !validUser(user) || user.id !== get().user?.id) throw new Error('Invalid refreshed account session')
        saveSession(access_token, refresh_token, user)
        api.setToken(access_token)
        set({ user, isAuthenticated: true })
        return true
      } catch (error: any) {
        if (expected === generation && (error?.status === 401 || error?.status === 403)) void get().logout()
        return false
      } finally {
        if (refreshFlight?.generation === expected) refreshFlight = null
      }
    })()
    refreshFlight = { generation: expected, promise }
    return promise
  },
  loadSession: () => {
    if (!accountsEnabled()) return
    const expected = ++generation
    const storage = getStorageAdapter()
    const accessToken = storage.getItem('streamforge_access_token')
    const userJSON = storage.getItem('streamforge_user')
    if (!accessToken || !userJSON) return
    try {
      const user = JSON.parse(userJSON)
      if (!validUser(user)) throw new Error('Invalid saved account')
      api.setToken(accessToken)
      set({ user, isAuthenticated: true })
      // Local account data is available immediately; cloud reads wait for renewal.
      void get().refreshAuth().then(() => { if (expected === generation) syncUserData(expected) })
    } catch {
      void get().logout()
    }
  },
  setSession: (accessToken, refreshToken, user) => {
    if (!accountsEnabled()) throw new Error('Accounts are not available in this build')
    if (!accessToken || !refreshToken || !validUser(user)) throw new Error('Invalid account session')
    const expected = ++generation
    saveSession(accessToken, refreshToken, user)
    api.setToken(accessToken)
    set({ user, isAuthenticated: true, isLoading: false, error: null })
    syncUserData(expected)
  },
  loginWithOAuth: async provider => {
    if (!accountsEnabled()) { set({ error: 'Accounts are not available in this build', isLoading: false }); return }
    const expected = generation
    set({ isLoading: true, error: null })
    try {
      const response = await api.getOAuthURL(provider)
      if (expected !== generation) return
      const win = (globalThis as any).window
      if (!response.data?.auth_url || !win?.open) throw new Error('This sign-in method is unavailable on this device')
      win.open(response.data.auth_url, '_blank')
      set({ isLoading: false })
    } catch (error: any) {
      if (expected === generation) set({ isLoading: false, error: error.message || 'Sign-in failed' })
    }
  },
  clearError: () => set({ error: null })
}))

/** Disable account work without deleting or exposing an older account's data. */
export function disableAccountsForLocalUse() {
  setAccountsEnabled(false)
  generation++
  api.setToken(null)
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null })
}

api.configureAuthRefresh(() => useAuthStore.getState().refreshAuth(), getAuthGeneration)
