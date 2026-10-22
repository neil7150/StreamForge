export interface StorageAdapter {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  setItems?: (entries: ReadonlyArray<readonly [string, string]>) => void
  removeItems?: (keys: string[]) => void
}

const inMemoryStorage = new Map<string, string>()

const defaultStorage: StorageAdapter = {
  getItem: (key: string): string | null => {
    try {
      const storage = (globalThis as any).localStorage
      if (storage) {
        return storage.getItem(key)
      }
    } catch {
      // Fall through to in-memory
    }
    return inMemoryStorage.get(key) ?? null
  },
  setItem: (key: string, value: string): void => {
    try {
      const storage = (globalThis as any).localStorage
      if (storage) {
        storage.setItem(key, value)
        return
      }
    } catch {
      // Fall through to in-memory
    }
    inMemoryStorage.set(key, value)
  },
  removeItem: (key: string): void => {
    try {
      const storage = (globalThis as any).localStorage
      if (storage) {
        storage.removeItem(key)
        return
      }
    } catch {
      // Fall through to in-memory
    }
    inMemoryStorage.delete(key)
  }
}

let activeStorage: StorageAdapter = defaultStorage

export function getStorageAdapter(): StorageAdapter {
  return activeStorage
}

export function setStorageAdapter(adapter: StorageAdapter): void {
  activeStorage = adapter
}
