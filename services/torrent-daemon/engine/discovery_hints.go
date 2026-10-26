package engine

import (
	"net"
	"sync"
	"time"

	"github.com/anacrolix/dht/v2/krpc"
	"github.com/anacrolix/torrent"
)

const discoveryHintLimit = 64
const discoveryHintTTL = 15 * time.Minute

// DiscoveryHints retains only public DHT routing contacts in process memory.
// Closing playback still closes every socket; no idle engine or disk cache is kept.
type DiscoveryHints struct {
	mu    sync.Mutex
	nodes []krpc.NodeInfo
	saved time.Time
}

func NewDiscoveryHints() *DiscoveryHints { return &DiscoveryHints{} }

func publicDHTNode(node krpc.NodeInfo) bool {
	ip := node.Addr.IP
	return node.Addr.Port > 0 && node.Addr.Port <= 65535 && ip.IsGlobalUnicast() && !ip.IsPrivate() && !ip.IsLoopback() && !ip.IsLinkLocalUnicast() && !ip.Equal(net.IPv4zero)
}

func (h *DiscoveryHints) capture(servers []torrent.DhtServer, now time.Time) {
	if h == nil {
		return
	}
	nodes := make([]krpc.NodeInfo, 0, discoveryHintLimit)
	seen := make(map[string]bool)
	for _, server := range servers {
		provider, ok := server.(interface{ Nodes() []krpc.NodeInfo })
		if !ok {
			continue
		}
		for _, node := range provider.Nodes() {
			key := node.Addr.String()
			if !publicDHTNode(node) || seen[key] {
				continue
			}
			seen[key] = true
			node.Addr.IP = append(net.IP(nil), node.Addr.IP...)
			nodes = append(nodes, node)
			if len(nodes) == discoveryHintLimit {
				break
			}
		}
		if len(nodes) == discoveryHintLimit {
			break
		}
	}
	if len(nodes) == 0 {
		return
	} // Don't overwrite useful hints after a failed cold attempt.
	h.mu.Lock()
	defer h.mu.Unlock()
	h.nodes = nodes
	h.saved = now
}

func (h *DiscoveryHints) restore(servers []torrent.DhtServer, now time.Time) {
	if h == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if now.Before(h.saved) || now.Sub(h.saved) > discoveryHintTTL {
		h.nodes = nil
		return
	}
	for _, server := range servers {
		for _, node := range h.nodes {
			_ = server.AddNode(node)
		}
	}
}

func (h *DiscoveryHints) Clear() {
	if h == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.nodes = nil
	h.saved = time.Time{}
}
