/**
 * StreamForge API Client
 * Handles all communication with the backend services.
 * Callers render unavailable states when the backend cannot be reached.
 */

function resolveDefaultAPIBase(): string {
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.EXPO_PUBLIC_API_BASE_URL) return process.env.EXPO_PUBLIC_API_BASE_URL.trim()
      if (process.env.VITE_API_BASE_URL) return process.env.VITE_API_BASE_URL.trim()
    }
  } catch {}
  return 'http://localhost:8080'
}

const API_BASE = resolveDefaultAPIBase()

interface RequestOptions {
  method?: string
  body?: unknown
  token?: string
  signal?: AbortSignal
}

export class APIClient {
  private baseURL: string
  private token: string | null = null

  constructor(baseURL: string) {
    this.baseURL = baseURL
  }

  setBaseURL(baseURL: string): void {
    this.baseURL = baseURL
  }

  getBaseURL(): string {
    return this.baseURL
  }

  setToken(token: string | null): void {
    this.token = token
  }

  async request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    if (!this.baseURL) {
      throw new Error('The StreamForge backend endpoint is not configured for this build.')
    }
    const { method = 'GET', body, token } = options
    const authToken = token || this.token

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`
    }

    const controller = new AbortController()
    const abort = () => controller.abort()
    if (options.signal?.aborted) controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, 15_000)
    try {
      const res = await fetch(`${this.baseURL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: { message: res.statusText } }))) as any
        const failure = new Error(err?.error?.message || `API Error: ${res.status}`) as Error & { status: number }
        failure.status = res.status
        throw failure
      }

      return await res.json() as T
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
    }
  }

  // ── Auth & Verification ───────────────────────
  async register(email: string, password: string) {
    return this.request('/auth/register', { method: 'POST', body: { email, password } })
  }

  async login(email: string, password: string) {
    return this.request<{ data: { access_token: string; refresh_token: string; user: any } }>(
      '/auth/login', { method: 'POST', body: { email, password } }
    )
  }

  async getMe() {
    return this.request<{ data: any }>('/auth/me')
  }

  async logout(refreshToken: string) {
    return this.request('/auth/logout', { method: 'POST', body: { refresh_token: refreshToken } })
  }

  async refresh(refreshToken: string) {
    return this.request<{ data: { access_token: string; refresh_token: string; user: any } }>(
      '/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken } }
    )
  }

  async requestEmailVerification() {
    return this.request<{ data: { verification_token: string; message: string } }>('/auth/verify-email/request', { method: 'POST' })
  }

  async verifyEmail(token: string) {
    return this.request<{ data: { message: string } }>('/auth/verify-email', { method: 'POST', body: { token } })
  }

  async getOAuthURL(provider: string, redirectURI?: string) {
    const params = redirectURI ? `?redirect_uri=${encodeURIComponent(redirectURI)}` : ''
    return this.request<{ data: { provider: string; auth_url: string; state: string } }>(`/auth/oauth/${provider}${params}`)
  }

  async exchangeOAuth(provider: string, code: string, redirectURI?: string) {
    return this.request<{ data: { access_token: string; refresh_token: string; user: any } }>(
      `/auth/oauth/${provider}/exchange`,
      { method: 'POST', body: { code, redirect_uri: redirectURI } }
    )
  }

  // ── Content ──────────────────────────────────
  async getMovies(page = 1, perPage = 20, genre?: string, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
    if (genre) params.set('genre', genre)
    return this.request(`/api/v1/movies?${params}`, { signal })
  }

  async getMovie(slug: string, signal?: AbortSignal) {
    return this.request(`/api/v1/movies/${slug}`, { signal })
  }

  async getTrending(limit = 20) {
    return this.request(`/api/v1/movies/trending?limit=${limit}`)
  }

  async getRecent(limit = 20) {
    return this.request(`/api/v1/movies/recent?limit=${limit}`)
  }

  async getGenres() {
    return this.request<{ data: Array<{ id: string; name: string; slug: string }> }>('/api/v1/genres')
  }

  async getMovieMagnets(id: string) {
    return this.request(`/api/v1/movies/${id}/magnets`)
  }

  async getShows(page = 1, perPage = 20, genre?: string, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
    if (genre) params.set('genre', genre)
    return this.request(`/api/v1/shows?${params}`, { signal })
  }

  async getShow(slug: string) {
    return this.request(`/api/v1/shows/${slug}`)
  }

  async getRecentMovies(limit = 20) {
    return this.getRecent(limit)
  }

  async getTrendingMovies(limit = 20) {
    return this.getTrending(limit)
  }

  async getMovieBySlug(slug: string, signal?: AbortSignal) {
    return this.getMovie(slug, signal)
  }

  async getShowBySlug(slug: string) {
    return this.getShow(slug)
  }

  // ── Admin Content Management ─────────────────
  async createAdminMovie(data: {
    title: string
    overview?: string
    tagline?: string
    release_date?: string
    runtime_minutes?: number
    language?: string
    poster_url?: string
    backdrop_url?: string
    trailer_url?: string
    imdb_id?: string
    content_rating?: string
    license_type?: string
    license_url?: string
    genre_ids?: string[]
  }) {
    return this.request<{ data: any }>('/api/v1/admin/movies', { method: 'POST', body: data })
  }

  async updateAdminMovie(id: string, data: any) {
    return this.request<{ data: any }>(`/api/v1/admin/movies/${id}`, { method: 'PUT', body: data })
  }

  async deleteAdminMovie(id: string) {
    return this.request<{ data: { deleted: boolean } }>(`/api/v1/admin/movies/${id}`, { method: 'DELETE' })
  }

  async addAdminMovieMagnet(movieId: string, data: {
    magnet_uri: string
    quality?: string
    codec?: string
    file_size_bytes?: number
    source?: string
  }) {
    return this.request<{ data: any }>(`/api/v1/admin/movies/${movieId}/magnets`, { method: 'POST', body: data })
  }

  async createAdminShow(data: {
    title: string
    overview?: string
    first_air_date?: string
    last_air_date?: string
    language?: string
    poster_url?: string
    backdrop_url?: string
    license_type?: string
    license_url?: string
    genre_ids?: string[]
  }) {
    return this.request<{ data: any }>('/api/v1/admin/shows', { method: 'POST', body: data })
  }

  async updateAdminShow(id: string, data: any) {
    return this.request<{ data: any }>(`/api/v1/admin/shows/${id}`, { method: 'PUT', body: data })
  }

  async deleteAdminShow(id: string) {
    return this.request<{ data: { deleted: boolean } }>(`/api/v1/admin/shows/${id}`, { method: 'DELETE' })
  }

  async createAdminSeason(showId: string, data: {
    season_number: number
    title?: string
    overview?: string
    poster_url?: string
    air_date?: string
  }) {
    return this.request<{ data: any }>(`/api/v1/admin/shows/${showId}/seasons`, { method: 'POST', body: data })
  }

  async createAdminEpisode(data: {
    season_id: string
    episode_number: number
    title: string
    overview?: string
    runtime_minutes?: number
    air_date?: string
    still_url?: string
  }) {
    return this.request<{ data: any }>('/api/v1/admin/episodes', { method: 'POST', body: data })
  }

  async addAdminEpisodeMagnet(episodeId: string, data: {
    magnet_uri: string
    quality?: string
    codec?: string
    file_size_bytes?: number
    source?: string
  }) {
    return this.request<{ data: any }>(`/api/v1/admin/episodes/${episodeId}/magnets`, { method: 'POST', body: data })
  }

  // ── User / Sync ─────────────────────────────────
  async getProfile() {
    return this.request<{ data: any }>('/api/v1/profile')
  }

  async updateProfile(data: { display_name?: string; avatar_url?: string }) {
    return this.request('/api/v1/profile', { method: 'PUT', body: data })
  }

  async getCloudWatchlist() {
    return this.request<{ data: any[] }>('/api/v1/sync/watchlist')
  }

  async syncWatchlist(items: any[]) {
    return this.request('/api/v1/sync/watchlist', { method: 'PUT', body: { items } })
  }

  async getCloudHistory() {
    return this.request<{ data: any[] }>('/api/v1/sync/history')
  }

  async syncHistory(items: any[]) {
    return this.request('/api/v1/sync/history', { method: 'PUT', body: { items } })
  }

  // ── Search ───────────────────────────────────────
  async search(query: string, type: 'movie' | 'show' | 'all' = 'all', page = 1, signal?: AbortSignal) {
    const params = new URLSearchParams({ q: query, type, page: String(page) })
    return this.request<{ data: any[]; meta: { total: number; page: number; per_page: number } }>(`/api/v1/search?${params}`, { signal })
  }

  async searchSuggest(query: string, signal?: AbortSignal) {
    return this.request<{ data: any[] }>(`/api/v1/search/suggest?q=${encodeURIComponent(query)}`, { signal })
  }
}

export const api = new APIClient(API_BASE)
