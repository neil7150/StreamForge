/**
 * StreamForge API Client
 * Handles all communication with the backend services.
 * Falls back to mock data when the backend is unreachable.
 */

const API_BASE = 'http://localhost:8080' // Nginx gateway

interface RequestOptions {
  method?: string
  body?: unknown
  token?: string
}

class APIClient {
  private baseURL: string
  private token: string | null = null

  constructor(baseURL: string) {
    this.baseURL = baseURL
  }

  setToken(token: string | null): void {
    this.token = token
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, token } = options
    const authToken = token || this.token

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`
    }

    const res = await fetch(`${this.baseURL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
      throw new Error(err?.error?.message || `API Error: ${res.status}`)
    }

    return res.json()
  }

  // ── Auth ─────────────────────────────────────
  async register(email: string, password: string) {
    return this.request('/auth/register', { method: 'POST', body: { email, password } })
  }

  async login(email: string, password: string) {
    return this.request<{ data: { access_token: string; refresh_token: string; user: any } }>(
      '/auth/login', { method: 'POST', body: { email, password } }
    )
  }

  async getMe() {
    return this.request('/auth/me')
  }

  // ── Content ──────────────────────────────────
  async getMovies(page = 1, perPage = 20, genre?: string) {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
    if (genre) params.set('genre', genre)
    return this.request(`/api/v1/movies?${params}`)
  }

  async getMovie(slug: string) {
    return this.request(`/api/v1/movies/${slug}`)
  }

  async getTrending(limit = 20) {
    return this.request(`/api/v1/movies/trending?limit=${limit}`)
  }

  async getRecent(limit = 20) {
    return this.request(`/api/v1/movies/recent?limit=${limit}`)
  }

  async getGenres() {
    return this.request('/api/v1/genres')
  }

  async getMovieMagnets(id: string) {
    return this.request(`/api/v1/movies/${id}/magnets`)
  }
}

export const api = new APIClient(API_BASE)
