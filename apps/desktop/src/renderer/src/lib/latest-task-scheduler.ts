export interface LatestTaskScheduler {
  schedule(task: () => void | Promise<void>): Promise<void>
  cancel(): void
}

/** Debounce asynchronous work while resolving superseded callers harmlessly. */
export function createLatestTaskScheduler(delayMs: number): LatestTaskScheduler {
  const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let resolvePending: (() => void) | null = null

  const cancel = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    resolvePending?.()
    resolvePending = null
  }

  return {
    schedule(task) {
      cancel()
      return new Promise<void>((resolve, reject) => {
        resolvePending = resolve
        timer = setTimeout(() => {
          timer = null
          resolvePending = null
          void Promise.resolve().then(task).then(resolve, reject)
        }, delay)
      })
    },
    cancel
  }
}
