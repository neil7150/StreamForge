import { create } from 'zustand'
import { api } from '../lib/api'

interface AuthUser {
  id: string
  email: string
  role: string
  email_verified: boolean
  is_active: boolean
}

interface AuthState {
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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.login(email, password)
      const { access_token, refresh_token, user } = response.data
      
      localStorage.setItem('streamforge_access_token', access_token)
      localStorage.setItem('streamforge_refresh_token', refresh_token)
      localStorage.setItem('streamforge_user', JSON.stringify(user))
      
      api.setToken(access_token)
      
      set({ user, isAuthenticated: true, isLoading: false })
      import('./userDataStore').then(({ useUserDataStore }) => {
        useUserDataStore.getState().syncFromCloud()
      })
    } catch (err: any) {
      set({ error: err.message || 'Login failed', isLoading: false })
    }
  },

  register: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.register(email, password) as any
      const { access_token, refresh_token, user } = response.data
      
      localStorage.setItem('streamforge_access_token', access_token)
      localStorage.setItem('streamforge_refresh_token', refresh_token)
      localStorage.setItem('streamforge_user', JSON.stringify(user))
      
      api.setToken(access_token)
      
      set({ user, isAuthenticated: true, isLoading: false })
      import('./userDataStore').then(({ useUserDataStore }) => {
        useUserDataStore.getState().syncFromCloud()
      })
    } catch (err: any) {
      set({ error: err.message || 'Registration failed', isLoading: false })
    }
  },

  logout: async () => {
    try {
      const { useUserDataStore } = await import('./userDataStore')
      await useUserDataStore.getState().syncToCloud()
    } catch {}

    try {
      const refreshToken = localStorage.getItem('streamforge_refresh_token')
      if (refreshToken) {
        await api.logout(refreshToken)
      }
    } catch (err) {
      // Ignore errors silently on logout
    } finally {
      localStorage.removeItem('streamforge_access_token')
      localStorage.removeItem('streamforge_refresh_token')
      localStorage.removeItem('streamforge_user')
      
      api.setToken(null)
      
      set({ user: null, isAuthenticated: false, error: null })
    }
  },

  refreshAuth: async () => {
    const refreshToken = localStorage.getItem('streamforge_refresh_token')
    if (!refreshToken) return false

    try {
      const response = await api.refresh(refreshToken)
      const { access_token, refresh_token: new_refresh_token, user } = response.data
      
      localStorage.setItem('streamforge_access_token', access_token)
      localStorage.setItem('streamforge_refresh_token', new_refresh_token)
      localStorage.setItem('streamforge_user', JSON.stringify(user))
      
      api.setToken(access_token)
      set({ user, isAuthenticated: true })
      return true
    } catch (err) {
      get().logout()
      return false
    }
  },

  loadSession: () => {
    const accessToken = localStorage.getItem('streamforge_access_token')
    const userStr = localStorage.getItem('streamforge_user')
    
    if (accessToken && userStr) {
      try {
        const user = JSON.parse(userStr)
        api.setToken(accessToken)
        set({ user, isAuthenticated: true })
        
        import('./userDataStore').then(({ useUserDataStore }) => {
          useUserDataStore.getState().syncFromCloud()
        })
        
        // Try a silent refresh in background
        get().refreshAuth().catch(() => {})
      } catch (err) {
        // Invalid session data
        get().logout()
      }
    }
  },

  setSession: (accessToken, refreshToken, user) => {
    localStorage.setItem('streamforge_access_token', accessToken)
    localStorage.setItem('streamforge_refresh_token', refreshToken)
    localStorage.setItem('streamforge_user', JSON.stringify(user))

    api.setToken(accessToken)
    set({ user, isAuthenticated: true, error: null, isLoading: false })

    import('./userDataStore').then(({ useUserDataStore }) => {
      useUserDataStore.getState().syncFromCloud()
    })
  },

  loginWithOAuth: async (provider) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.getOAuthURL(provider)
      const authUrl = res.data?.auth_url
      if (authUrl) {
        window.open(authUrl, '_blank')
      }
      set({ isLoading: false })
    } catch (err: any) {
      set({ error: err.message || `Failed to initiate ${provider} sign-in`, isLoading: false })
    }
  },

  clearError: () => set({ error: null })
}))
