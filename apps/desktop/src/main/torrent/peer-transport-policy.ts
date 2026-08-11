export type PeerTransport = 'tcp' | 'utp' | 'webrtc' | 'webseed' | 'unknown'
export type PeerDiscoverySource = 'tracker' | 'dht' | 'lsd' | 'pex' | 'manual' | 'unknown'

export interface PeerTransportCounts {
  tcp: number
  utp: number
  webrtc: number
  webseed: number
  unknown: number
}

export interface PeerDiscoveryCounts {
  tracker: number
  dht: number
  lsd: number
  pex: number
  manual: number
  unknown: number
}

export interface PeerDiscoveryStats {
  total: number
  bySource: PeerDiscoveryCounts
  fastTcpFallbacksArmed: number
}

export interface PeerConnectionDiagnostics {
  discovered: number
  pending: number
  connected: number
  fastTcpFallbacksArmed: number
  bySource: PeerDiscoveryCounts
  byTransport: PeerTransportCounts
}

export interface PeerDiscoveryRefreshState {
  connected: number
  pending: number
}

/**
 * Request another tracker announce only when the stream has too few live
 * connections and is not already working through a useful queue of peers.
 */
export function shouldRefreshPeerDiscovery({
  connected,
  pending
}: PeerDiscoveryRefreshState): boolean {
  return connected < 8 && pending < 20
}

interface InternalPeer {
  id?: string
  type?: string
  source?: string | null
  retries?: number
}

interface InternalWire {
  type?: string
}

interface PeerAwareTorrent {
  numPeers: number
  wires?: InternalWire[]
  _peers?: Map<string, InternalPeer>
}

// WebTorrent 2.x switches a failed uTP peer to TCP after its retry budget is
// exhausted. Marking the first attempt as exhausted keeps uTP available while
// avoiding the library's additional 1s, 5s, and 15s uTP retry delays.
const EXHAUST_UTP_RETRY_BUDGET = Number.MAX_SAFE_INTEGER

export function createPeerDiscoveryStats(): PeerDiscoveryStats {
  return {
    total: 0,
    bySource: {
      tracker: 0,
      dht: 0,
      lsd: 0,
      pex: 0,
      manual: 0,
      unknown: 0
    },
    fastTcpFallbacksArmed: 0
  }
}

function peerKey(peer: unknown): string | null {
  if (typeof peer === 'string') return peer
  if (typeof peer !== 'object' || peer === null) return null
  const id = (peer as { id?: unknown }).id
  return typeof id === 'string' ? id : null
}

function internalPeer(torrent: PeerAwareTorrent, peer: unknown): InternalPeer | null {
  const key = peerKey(peer)
  return key ? torrent._peers?.get(key) ?? null : null
}

export function normalizePeerSource(source: unknown): PeerDiscoverySource {
  switch (source) {
    case 'tracker': return 'tracker'
    case 'dht': return 'dht'
    case 'lsd': return 'lsd'
    case 'ut_pex': return 'pex'
    case 'manual': return 'manual'
    default: return 'unknown'
  }
}

export function normalizePeerTransport(type: unknown): PeerTransport {
  if (type === 'tcpIncoming' || type === 'tcpOutgoing') return 'tcp'
  if (type === 'utpIncoming' || type === 'utpOutgoing') return 'utp'
  if (type === 'webrtc') return 'webrtc'
  if (type === 'webSeed') return 'webseed'
  return 'unknown'
}

/** Configure one discovered uTP peer to fall back to TCP after its first failure. */
export function armFastTcpFallback(torrent: PeerAwareTorrent, peer: unknown): boolean {
  const candidate = internalPeer(torrent, peer)
  if (!candidate || candidate.type !== 'utpOutgoing') return false
  candidate.retries = EXHAUST_UTP_RETRY_BUDGET
  return true
}

/** Record a peer discovery after WebTorrent has registered its source and transport. */
export function recordPeerDiscovery(
  stats: PeerDiscoveryStats,
  torrent: PeerAwareTorrent,
  peer: unknown
): void {
  const source = normalizePeerSource(internalPeer(torrent, peer)?.source)
  stats.total += 1
  stats.bySource[source] += 1
  if (armFastTcpFallback(torrent, peer)) stats.fastTcpFallbacksArmed += 1
}

export function buildPeerConnectionDiagnostics(
  torrent: PeerAwareTorrent,
  discovery: PeerDiscoveryStats = createPeerDiscoveryStats()
): PeerConnectionDiagnostics {
  const byTransport: PeerTransportCounts = {
    tcp: 0,
    utp: 0,
    webrtc: 0,
    webseed: 0,
    unknown: 0
  }
  for (const wire of torrent.wires ?? []) {
    byTransport[normalizePeerTransport(wire.type)] += 1
  }

  return {
    discovered: discovery.total,
    pending: Math.max(0, (torrent._peers?.size ?? torrent.numPeers) - torrent.numPeers),
    connected: torrent.numPeers,
    fastTcpFallbacksArmed: discovery.fastTcpFallbacksArmed,
    bySource: { ...discovery.bySource },
    byTransport
  }
}

export function describeConnectedPeer(torrent: PeerAwareTorrent, peerAddress: unknown, wireType: unknown): string {
  const source = normalizePeerSource(internalPeer(torrent, peerAddress)?.source)
  const transport = normalizePeerTransport(wireType)
  return `${transport} via ${source}`
}
