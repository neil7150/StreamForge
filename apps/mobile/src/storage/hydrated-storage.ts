export interface AsyncKeyStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export function scopeLibraryKey(key: string, accountId: string | null): string {
  return ['streamforge_watchlist', 'streamforge_history', 'streamforge_library_deletions'].includes(key)
    ? `streamforge.library.v1.${accountId === null ? 'guest' : `user-${encodeURIComponent(accountId)}`}.${key}`
    : key
}

/** Sync reads for existing stores, backed by serialized async writes after hydration. */
export class HydratedStorage {
  private values = new Map<string, string>()
  private pending = new Map<string, string | null>()
  private tail: Promise<void> = Promise.resolve()
  private ready = false
  private failure: unknown = null

  constructor(private backing: AsyncKeyStorage, private onError: (error: unknown) => void = () => {}) {}

  async hydrate(keys: string[]) {
    if (this.ready) return
    const entries = await Promise.all(keys.map(async key => [key, await this.backing.getItem(key)] as const))
    for (const [key, value] of entries) if (value !== null) this.values.set(key, value)
    this.ready = true
  }

  getItem = (key: string): string | null => {
    if (!this.ready) throw new Error('Storage has not finished loading')
    return this.values.get(key) ?? null
  }

  setItem = (key: string, value: string) => this.write(key, value)
  removeItem = (key: string) => this.write(key, null)

  private write(key: string, value: string | null) {
    if (!this.ready) throw new Error('Storage has not finished loading')
    if (value === null) this.values.delete(key)
    else this.values.set(key, value)
    this.pending.set(key, value)
    this.enqueue(key, value)
  }

  private enqueue(key: string, value: string | null) {
    this.tail = this.tail.then(async () => {
      try {
        if (value === null) await this.backing.removeItem(key)
        else await this.backing.setItem(key, value)
        if (this.pending.get(key) === value) this.pending.delete(key)
        if (this.pending.size === 0) this.failure = null
      } catch (error) {
        this.failure = error
        this.onError(error)
      }
    })
  }

  async flush() {
    await this.tail
    if (this.failure) {
      for (const [key, value] of this.pending) this.enqueue(key, value)
      await this.tail
    }
    if (this.failure) throw new Error('Changes could not be saved. Please retry.')
  }
}
