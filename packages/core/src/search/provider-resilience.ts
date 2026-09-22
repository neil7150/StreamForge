import type {
  TorrentProviderName,
  TorrentSearchResponse
} from './provider-policy'

export interface ProviderGate {
  allowed: boolean
  consecutiveFailures: number
  retryAt?: number
}

interface ProviderHealthState {
  consecutiveFailures: number
  circuitOpenUntil: number
  lastLatencyMs: number
}

export class ProviderHealthTracker {
  private readonly states = new Map<TorrentProviderName, ProviderHealthState>()
  private readonly failureThreshold: number
  private readonly cooldownMs: number
  private readonly now: () => number

  constructor(
    failureThreshold = 5,
    cooldownMs = 45_000,
    now: () => number = Date.now
  ) {
    this.failureThreshold = failureThreshold
    this.cooldownMs = cooldownMs
    this.now = now
  }

  canRequest(name: TorrentProviderName): ProviderGate {
    const state = this.states.get(name)
    if (!state) return { allowed: true, consecutiveFailures: 0 }
    const currentTime = this.now()
    if (state.circuitOpenUntil > currentTime) {
      return {
        allowed: false,
        consecutiveFailures: state.consecutiveFailures,
        retryAt: state.circuitOpenUntil
      }
    }
    return { allowed: true, consecutiveFailures: state.consecutiveFailures }
  }

  recordSuccess(name: TorrentProviderName, latencyMs: number): ProviderHealthState {
    const state = {
      consecutiveFailures: 0,
      circuitOpenUntil: 0,
      lastLatencyMs: Math.max(0, Math.round(latencyMs))
    }
    this.states.set(name, state)
    return state
  }

  recordFailure(name: TorrentProviderName, latencyMs: number): ProviderHealthState {
    const previous = this.states.get(name)
    const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1
    const state = {
      consecutiveFailures,
      circuitOpenUntil: consecutiveFailures >= this.failureThreshold
        ? this.now() + this.cooldownMs
        : 0,
      lastLatencyMs: Math.max(0, Math.round(latencyMs))
    }
    this.states.set(name, state)
    return state
  }
}

interface CacheEntry {
  storedAt: number
  response: TorrentSearchResponse
}

export interface CachedSearchResponse {
  response: TorrentSearchResponse
  ageMs: number
}

function cloneResponse(response: TorrentSearchResponse): TorrentSearchResponse {
  return {
    results: response.results.map((result) => ({ ...result })),
    providers: response.providers.map((provider) => ({ ...provider })),
    cache: response.cache
  }
}

export class SearchResponseCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly freshTtlMs: number
  private readonly staleTtlMs: number
  private readonly maximumEntries: number
  private readonly now: () => number

  constructor(
    freshTtlMs = 90_000,
    staleTtlMs = 15 * 60_000,
    maximumEntries = 40,
    now: () => number = Date.now
  ) {
    this.freshTtlMs = freshTtlMs
    this.staleTtlMs = staleTtlMs
    this.maximumEntries = maximumEntries
    this.now = now
  }

  static key(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  set(query: string, response: TorrentSearchResponse): void {
    const key = SearchResponseCache.key(query)
    if (!key) return
    this.entries.delete(key)
    this.entries.set(key, { storedAt: this.now(), response: cloneResponse(response) })
    while (this.entries.size > this.maximumEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  getFresh(query: string): CachedSearchResponse | null {
    const cached = this.get(query)
    return cached && cached.ageMs <= this.freshTtlMs ? cached : null
  }

  getStale(query: string): CachedSearchResponse | null {
    const cached = this.get(query)
    return cached && cached.ageMs <= this.staleTtlMs ? cached : null
  }

  private get(query: string): CachedSearchResponse | null {
    const key = SearchResponseCache.key(query)
    const entry = this.entries.get(key)
    if (!entry) return null
    const ageMs = Math.max(0, this.now() - entry.storedAt)
    if (ageMs > this.staleTtlMs) {
      this.entries.delete(key)
      return null
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return { response: cloneResponse(entry.response), ageMs }
  }
}
