/** Kept independent of React Native so configuration failures are testable. */
export function resolveMobileBackend(value: string | undefined): string {
  const input = value?.trim()
  if (!input) return ''
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}
