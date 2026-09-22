package mobile

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/streamforge/services/torrent-daemon/engine"
	"github.com/streamforge/services/torrent-daemon/server"
)

var (
	engInstance    *engine.TorrentEngine
	serverInstance *server.StreamServer
	bridgeMu       sync.Mutex
	serverPort     = 8888
)

// StartDaemon starts the local torrent streaming engine and HTTP server on the Android device.
func StartDaemon(cacheDir string, port int) string {
	bridgeMu.Lock()
	defer bridgeMu.Unlock()

	if engInstance != nil {
		return fmt.Sprintf("http://127.0.0.1:%d", serverPort)
	}

	if port > 0 {
		serverPort = port
	}

	var err error
	engInstance, err = engine.NewTorrentEngine(cacheDir, serverPort+1)
	if err != nil {
		return fmt.Sprintf("ERROR: %v", err)
	}

	serverInstance = server.NewStreamServer(engInstance, serverPort)
	go func() {
		_ = serverInstance.Start()
	}()

	return fmt.Sprintf("http://127.0.0.1:%d", serverPort)
}

// StopDaemon stops the local torrent streaming engine and cleans up memory.
func StopDaemon() {
	bridgeMu.Lock()
	defer bridgeMu.Unlock()

	if serverInstance != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = serverInstance.Stop(ctx)
		serverInstance = nil
	}

	if engInstance != nil {
		_ = engInstance.Close()
		engInstance = nil
	}
}

// AddMagnet prepares a torrent for sequential streaming and returns the local HTTP stream URL.
func AddMagnet(magnetURI string, fileIndex int) string {
	bridgeMu.Lock()
	eng := engInstance
	bridgeMu.Unlock()

	if eng == nil {
		return "ERROR: engine not running"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	_, infoHash, err := eng.AddStream(ctx, magnetURI, fileIndex)
	if err != nil {
		return fmt.Sprintf("ERROR: %v", err)
	}

	return fmt.Sprintf("http://127.0.0.1:%d/stream/%s", serverPort, infoHash)
}

// CleanupStream cleans up an active stream and stops downloading pieces.
func CleanupStream(infoHash string) {
	bridgeMu.Lock()
	eng := engInstance
	bridgeMu.Unlock()

	if eng != nil {
		eng.RemoveStream(infoHash)
	}
}

// GetStats returns current progress, peer count, and transfer speeds as JSON.
func GetStats(infoHash string) string {
	bridgeMu.Lock()
	eng := engInstance
	bridgeMu.Unlock()

	if eng == nil {
		return "{}"
	}

	stats, err := eng.GetStats(infoHash)
	if err != nil {
		return "{}"
	}

	data, err := json.Marshal(stats)
	if err != nil {
		return "{}"
	}

	return string(data)
}
