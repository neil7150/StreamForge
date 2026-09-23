import fs from 'node:fs';

function replaceInFile(path, oldText, newText) {
  let content = fs.readFileSync(path, 'utf8');
  const normOld = oldText.replace(/\r\n/g, '\n');
  const normContent = content.replace(/\r\n/g, '\n');
  if (normContent.includes(normOld)) {
    content = normContent.replace(normOld, newText);
    fs.writeFileSync(path, content, 'utf8');
    console.log(`Updated ${path}`);
  } else {
    console.warn(`Could not find target block in ${path}`);
  }
}

// 1. media-track-policy.ts
replaceInFile(
  'packages/core/src/policies/media-track-policy.ts',
  `export interface MediaAudioTrack {
  index: number
  codec: string
  language: string
  title: string | null
  channels: number
  channelLayout: string | null
  isDefault: boolean
}

export interface MediaSubtitleTrack {
  index: number
  codec: string
  language: string
  title: string | null
  isDefault: boolean
  textBased: boolean
}`,
  `import type { MediaAudioTrack, MediaSubtitleTrack } from '../types/torrent'`
);

// 2. episode-file-policy.ts
replaceInFile(
  'packages/core/src/policies/episode-file-policy.ts',
  `export interface PreferredEpisodeFile {
  seasonNumber: number
  episodeNumber: number
  fileIndex?: number
  absoluteEpisodeNumber?: number
  absoluteEpisodeOnly?: boolean
  seriesTitles?: string[]
}`,
  `import type { PreferredEpisodeFile } from '../types/torrent'`
);

// 3. peer-transport-policy.ts
replaceInFile(
  'packages/core/src/policies/peer-transport-policy.ts',
  `export interface PeerConnectionDiagnostics {
  discovered: number
  pending: number
  connected: number
  fastTcpFallbacksArmed: number
  bySource: PeerDiscoveryCounts
  byTransport: PeerTransportCounts
}`,
  `// PeerConnectionDiagnostics defined in types/torrent
import type { PeerConnectionDiagnostics } from '../types/torrent'`
);

// 4. tvmaze-client.ts
replaceInFile(
  'packages/core/src/clients/tvmaze-client.ts',
  `export interface SeriesSummary {
  id: number
  title: string
  posterUrl: string | null
  year: number | null
  status: string | null
  network: string | null
  type: string | null
  language: string | null
  genres: string[]
  rating: number | null
  summary: string | null
  tvmazeUrl: string | null
  imdbId: string | null
}

export interface SeriesDetails extends SeriesSummary {
  premiered: string | null
  ended: string | null
  runtimeMinutes: number | null
  officialSite: string | null
  originalImageUrl: string | null
}

export interface SeasonSummary {
  id: number
  seriesId: number
  number: number
  name: string | null
  episodeCount: number | null
  premiereDate: string | null
  endDate: string | null
  network: string | null
  posterUrl: string | null
  summary: string | null
  absoluteEpisodeStart?: number
  absoluteEpisodeEnd?: number
}

export interface EpisodeSummary {
  id: number
  seasonId: number
  seasonNumber: number
  episodeNumber: number | null
  title: string
  type: string | null
  airDate: string | null
  airStamp: string | null
  runtimeMinutes: number | null
  stillUrl: string | null
  summary: string | null
  tvmazeUrl: string | null
}`,
  `import type { SeriesSummary, SeriesDetails, SeasonSummary, EpisodeSummary } from '../types/torrent'`
);

// 5. anilist-client.ts
replaceInFile(
  'packages/core/src/clients/anilist-client.ts',
  `export interface AnimeSearchMetadata {
  aliases: string[]
  episodeCount: number | null
}`,
  `import type { AnimeSearchMetadata } from '../types/torrent'`
);

// 6. opensubtitles-client.ts
replaceInFile(
  'packages/core/src/clients/opensubtitles-client.ts',
  `export interface OnlineSubtitleSearchRequest {
  apiKey: string
  query: string
  language?: string
  seasonNumber?: number
  episodeNumber?: number
}

export interface OnlineSubtitleResult {
  id: string
  fileId: number
  fileName: string
  language: string
  release: string | null
  downloadCount: number
}`,
  `import type { OnlineSubtitleSearchRequest, OnlineSubtitleResult } from '../types/torrent'`
);

// 7. movie-catalog-client.ts
replaceInFile(
  'packages/core/src/clients/movie-catalog-client.ts',
  `export interface MovieSummary {
  id: string
  title: string
  year: number | null
  posterUrl: string | null
  rating: number | null
  genres: string[]
  language: string | null
  imdbId: string | null
}

export interface MovieDetails extends MovieSummary {
  summary: string | null
  runtimeMinutes: number | null
  backdropUrl: string | null
  contentRating: string | null
  ytsUrl: string | null
}`,
  `import type { MovieSummary, MovieDetails } from '../types/torrent'`
);

// 8. yts-movie-client.ts
replaceInFile(
  'packages/core/src/clients/yts-movie-client.ts',
  `export interface MovieSummary {
  id: string
  title: string
  year: number | null
  posterUrl: string | null
  rating: number | null
  genres: string[]
  language: string | null
  imdbId: string | null
}

export interface MovieDetails extends MovieSummary {
  summary: string | null
  runtimeMinutes: number | null
  backdropUrl: string | null
  contentRating: string | null
  ytsUrl: string | null
}`,
  `import type { MovieSummary, MovieDetails } from '../types/torrent'`
);

// 9. provider-policy.ts
replaceInFile(
  'packages/core/src/search/provider-policy.ts',
  `export type TorrentProviderName =
  | 'APIBay'
  | 'Nyaa'
  | 'AnimeTosho'
  | 'TokyoTosho'
  | 'SubsPlease'
  | 'AniDex'
  | 'YTS'
  | 'EZTV'
  | 'Knaben'
  | 'Torznab'
  | 'StremioAddon'
  | 'InternetArchive'
  | '1337x'

export interface TorrentSearchResult {
  id: string
  name: string
  magnetURI: string
  seeders: number
  leechers: number
  size: string
  sizeBytes: number
  category: string
  added: string
  provider: TorrentProviderName
  qualityScore?: number
  fileIndex?: number
}

export interface TorrentProviderStatus {
  name: TorrentProviderName
  status: 'ok' | 'error' | 'cooldown'
  count: number
  error?: string
  latencyMs?: number
  consecutiveFailures?: number
  retryAt?: number
  fromCache?: boolean
}

export interface TorrentSearchResponse {
  results: TorrentSearchResult[]
  providers: TorrentProviderStatus[]
  cache?: 'miss' | 'fresh' | 'stale'
}`,
  `import type { TorrentProviderName, TorrentSearchResult, TorrentProviderStatus, TorrentSearchResponse } from '../types/torrent'`
);

// 10. episode-search-policy.ts
replaceInFile(
  'packages/core/src/search/episode-search-policy.ts',
  `export interface EpisodeTorrentSearchRequest {
  seriesTitle: string
  seasonNumber: number
  episodeNumber: number
  episodeTitle?: string
  imdbId?: string
  seriesAliases?: string[]
  absoluteEpisodeNumber?: number
  absoluteEpisodeOnly?: boolean
  torznabUrl?: string
  torznabApiKey?: string
  torznabEndpoints?: Array<{ url: string; apiKey?: string }>
  stremioAddonUrls?: string[]
}`,
  `import type { EpisodeTorrentSearchRequest } from '../types/torrent'`
);

// 11. movie-search-policy.ts
replaceInFile(
  'packages/core/src/search/movie-search-policy.ts',
  `export interface MovieTorrentSearchRequest {
  title: string
  year?: number
  imdbId?: string
  torznabUrl?: string
  torznabApiKey?: string
  torznabEndpoints?: Array<{ url: string; apiKey?: string }>
  stremioAddonUrls?: string[]
}`,
  `import type { MovieTorrentSearchRequest } from '../types/torrent'`
);

console.log('Unification complete');
