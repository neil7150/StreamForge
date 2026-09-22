type CleanupCallback = () => void | Promise<void>

const pendingCleanups = new Map<string, ReturnType<typeof setTimeout>>()

function normalizeHash(infoHash: string): string {
  return infoHash.trim().toLowerCase()
}

export function cancelScheduledStreamCleanup(infoHash: string): void {
  const key = normalizeHash(infoHash)
  const timer = pendingCleanups.get(key)
  if (!timer) return
  clearTimeout(timer)
  pendingCleanups.delete(key)
}

export function scheduleStreamCleanup(
  infoHash: string,
  cleanup: CleanupCallback,
  delayMs: number = 500
): void {
  const key = normalizeHash(infoHash)
  cancelScheduledStreamCleanup(key)

  const timer = setTimeout(() => {
    pendingCleanups.delete(key)
    void Promise.resolve(cleanup()).catch((error) => {
      console.warn(`[StreamCleanup] Failed to clean ${key}:`, error)
    })
  }, Math.max(0, delayMs))

  pendingCleanups.set(key, timer)
}

export function hasScheduledStreamCleanup(infoHash: string): boolean {
  return pendingCleanups.has(normalizeHash(infoHash))
}
