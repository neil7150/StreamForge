export interface HistoryEntryDraft {
  movieId: string
  slug: string
  title: string
  poster: string
  progress: number
  currentTime?: number
  duration?: number
  magnetURI: string
}

export function preserveHistoryMetadata(
  existing: HistoryEntryDraft | undefined,
  incoming: HistoryEntryDraft
): HistoryEntryDraft {
  const title = incoming.title.trim() || existing?.title.trim() || 'Unknown'
  const poster = incoming.poster.trim() || existing?.poster.trim() || ''
  const magnetURI = incoming.magnetURI.trim() || existing?.magnetURI.trim() || ''
  const slug = incoming.slug.trim() || existing?.slug.trim() || incoming.movieId
  return { ...incoming, title, poster, magnetURI, slug }
}
