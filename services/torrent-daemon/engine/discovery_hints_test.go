package engine

import (
	"net"
	"testing"
	"time"

	"github.com/anacrolix/dht/v2/krpc"
	"github.com/anacrolix/torrent"
)

type hintServer struct {
	torrent.DhtServer
	nodes []krpc.NodeInfo
	added []krpc.NodeInfo
}

func (s *hintServer) Nodes() []krpc.NodeInfo           { return s.nodes }
func (s *hintServer) AddNode(node krpc.NodeInfo) error { s.added = append(s.added, node); return nil }

func TestDiscoveryHintsBoundFilterExpireAndClear(t *testing.T) {
	now := time.Now()
	hints := NewDiscoveryHints()
	source := &hintServer{}
	for i := 0; i < 100; i++ {
		node := krpc.NodeInfo{Addr: krpc.NodeAddr{IP: net.IPv4(8, 8, 8, byte(i+1)), Port: 6881}}
		node.ID[0] = byte(i + 1)
		source.nodes = append(source.nodes, node)
	}
	private := krpc.NodeInfo{Addr: krpc.NodeAddr{IP: net.IPv4(192, 168, 1, 1), Port: 6881}}
	if publicDHTNode(private) || publicDHTNode(krpc.NodeInfo{Addr: krpc.NodeAddr{IP: net.IPv4(127, 0, 0, 1), Port: 6881}}) {
		t.Fatal("accepted private routing hint")
	}
	hints.capture([]torrent.DhtServer{source}, now)
	target := &hintServer{}
	hints.restore([]torrent.DhtServer{target}, now.Add(time.Minute))
	if len(target.added) != discoveryHintLimit {
		t.Fatalf("restored %d nodes", len(target.added))
	}
	// Capture owns its own IP bytes, independent of the original routing table.
	source.nodes[0].Addr.IP[0] ^= 0xff
	if !target.added[0].Addr.IP.Equal(net.IPv4(8, 8, 8, 1)) {
		t.Fatal("routing table mutation changed cached hint")
	}
	target.added = nil
	hints.restore([]torrent.DhtServer{target}, now.Add(discoveryHintTTL+time.Second))
	if len(target.added) != 0 {
		t.Fatal("expired hints restored")
	}
	hints.capture([]torrent.DhtServer{source}, now)
	hints.Clear()
	hints.restore([]torrent.DhtServer{target}, now)
	if len(target.added) != 0 {
		t.Fatal("cleared hints restored")
	}
}
