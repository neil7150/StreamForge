export function parseMovieCatalogId(value: string | undefined): string | null {
  if (!value) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return null
  }
  if (!/^(?:cinemeta:tt\d{5,12}|yts:\d{1,10})$/i.test(decoded)) return null
  return decoded.toLowerCase()
}
