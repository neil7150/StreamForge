import assert from 'node:assert/strict'
import test from 'node:test'
import {
  armFastTcpFallback,
  buildPeerConnectionDiagnostics,
  createPeerDiscoveryStats,
  describeConnectedPeer,
  recordPeerDiscovery
} from '../src/main/torrent/peer-transport-policy.ts'

test('arms immediate TCP fallback only for outgoing uTP peers', () => {
  const utpPeer = { type: 'utpOutgoing', source: 'tracker', retries: 0 }
  const tcpPeer = { type: 'tcpOutgoing', source: 'dht', retries: 0 }
  const torrent = {
    numPeers: 0,
    _peers: new Map([
      ['1.2.3.4:5000', utpPeer],
      ['5.6.7.8:6000', tcpPeer]
    ])
  }

  assert.equal(armFastTcpFallback(torrent, '1.2.3.4:5000'), true)
  assert.equal(utpPeer.retries, Number.MAX_SAFE_INTEGER)
  assert.equal(armFastTcpFallback(torrent, '5.6.7.8:6000'), false)
  assert.equal(tcpPeer.retries, 0)
})

test('records discovery sources and reports live transports separately', () => {
  const torrent = {
    numPeers: 3,
    _peers: new Map([
      ['tracker-peer', { type: 'utpOutgoing', source: 'tracker', retries: 0 }],
      ['dht-peer', { type: 'tcpOutgoing', source: 'dht', retries: 0 }],
      ['pex-peer', { type: 'tcpOutgoing', source: 'ut_pex', retries: 0 }],
      ['pending-peer', { type: 'utpOutgoing', source: 'tracker', retries: 0 }]
    ]),
    wires: [
      { type: 'utpOutgoing' },
      { type: 'tcpOutgoing' },
      { type: 'tcpIncoming' }
    ]
  }
  const stats = createPeerDiscoveryStats()
  recordPeerDiscovery(stats, torrent, 'tracker-peer')
  recordPeerDiscovery(stats, torrent, 'dht-peer')
  recordPeerDiscovery(stats, torrent, 'pex-peer')

  const diagnostics = buildPeerConnectionDiagnostics(torrent, stats)
  assert.equal(diagnostics.discovered, 3)
  assert.equal(diagnostics.pending, 1)
  assert.equal(diagnostics.connected, 3)
  assert.equal(diagnostics.fastTcpFallbacksArmed, 1)
  assert.deepEqual(diagnostics.bySource, {
    tracker: 1,
    dht: 1,
    lsd: 0,
    pex: 1,
    manual: 0,
    unknown: 0
  })
  assert.deepEqual(diagnostics.byTransport, {
    tcp: 2,
    utp: 1,
    webrtc: 0,
    webseed: 0,
    unknown: 0
  })
  assert.equal(describeConnectedPeer(torrent, 'dht-peer', 'tcpOutgoing'), 'tcp via dht')
})
