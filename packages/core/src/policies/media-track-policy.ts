import type { MediaAudioTrack, MediaSubtitleTrack } from '../types/torrent'

const SUPPORTED_AUDIO_CODECS = new Set([
  'aac', 'mp3', 'mp2',
  'opus', 'vorbis',
  'flac',
  'pcm_s16le', 'pcm_s24le', 'pcm_f32le'
])

const TEXT_SUBTITLE_CODECS = new Set([
  'ass',
  'ssa',
  'subrip',
  'srt',
  'text',
  'mov_text',
  'webvtt'
])

export function isTextSubtitleCodec(codec: string | null | undefined): boolean {
  return !!codec && TEXT_SUBTITLE_CODECS.has(codec.toLowerCase())
}

export function isAudioCodecSupported(codec: string | null | undefined): boolean {
  return !!codec && SUPPORTED_AUDIO_CODECS.has(codec.toLowerCase())
}

export function selectAudioTrack(
  tracks: MediaAudioTrack[],
  requestedIndex?: number
): MediaAudioTrack | null {
  if (requestedIndex !== undefined) {
    const requested = tracks.find((track) => track.index === requestedIndex)
    if (requested) return requested
  }
  return tracks.find((track) => track.isDefault) ?? tracks[0] ?? null
}