export function parseMovieCatalogId(value: string | undefined): string | null {
  if (!value) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return null
  }
  // Reject bare numeric IDs without a provider prefix (e.g. '42')
  if (/^\d+$/.test(decoded)) return null
  // Allow cinemeta/yts IDs, UUIDs, and alphanumeric slugs
  if (!/^(?:cinemeta:tt\d{5,12}|yts:\d{1,10}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9-]+)$/i.test(decoded)) return null
  return decoded.toLowerCase()
}
