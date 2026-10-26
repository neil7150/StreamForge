package mobile

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
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
	discoveryHints = engine.NewDiscoveryHints()
)

func StartDaemon(cacheDir string, port int) string {
	bridgeMu.Lock()
	defer bridgeMu.Unlock()
	if engInstance != nil {
		return fmt.Sprintf("http://127.0.0.1:%d", serverPort)
	}
	if port > 0 {
		serverPort = port
	}
	eng, err := engine.NewTorrentEngineWithHints(cacheDir, 0, discoveryHints)
	if err != nil {
		return fmt.Sprintf("ERROR: %v", err)
	}
	srv := server.NewStreamServer(eng, serverPort)
	if err := srv.Listen(); err != nil {
		_ = eng.Close()
		return fmt.Sprintf("ERROR: could not bind local media server: %v", err)
	}
	engInstance = eng
	serverInstance = srv
	return fmt.Sprintf("http://127.0.0.1:%d", serverPort)
}

func StopDaemon() {
	bridgeMu.Lock()
	defer bridgeMu.Unlock()
	if engInstance != nil {
		_ = engInstance.Close()
		engInstance = nil
	}
	if serverInstance != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		_ = serverInstance.Stop(ctx)
		cancel()
		serverInstance = nil
	}
}

func current() (*engine.TorrentEngine, int) {
	bridgeMu.Lock()
	defer bridgeMu.Unlock()
	return engInstance, serverPort
}
func sessionJSON(info *engine.SessionInfo, err error, port int) string {
	if err != nil {
		return fmt.Sprintf("ERROR: %v", err)
	}
	if info.Ready {
		info.StreamURL = fmt.Sprintf("http://127.0.0.1:%d/stream/%s?token=%s", port, info.SessionID, info.Token)
	}
	data, err := json.Marshal(info)
	if err != nil {
		return fmt.Sprintf("ERROR: %v", err)
	}
	return string(data)
}

func PrepareSession(id, magnet string, fileIndex, season, episode int) string {
	eng, port := current()
	if eng == nil {
		return "ERROR: engine not running"
	}
	info, err := eng.PrepareSession(id, magnet, fileIndex, season, episode)
	return sessionJSON(info, err, port)
}
func SelectFile(id string, index int) string {
	eng, port := current()
	if eng == nil {
		return "ERROR: engine not running"
	}
	info, err := eng.SelectFile(id, index)
	return sessionJSON(info, err, port)
}
func CancelSession(id string) {
	eng, _ := current()
	if eng != nil {
		eng.CancelSession(id)
	}
}
func GetStats(id string) string {
	eng, _ := current()
	if eng == nil {
		return "ERROR: streaming engine stopped; retry playback"
	}
	stats, err := eng.GetStats(id)
	if err != nil {
		return fmt.Sprintf("ERROR: %v", err)
	}
	data, err := json.Marshal(stats)
	if err != nil {
		return fmt.Sprintf("ERROR: encode stream statistics: %v", err)
	}
	return string(data)
}
func GetCacheSize(cacheDir string) string {
	bridgeMu.Lock()
	defer bridgeMu.Unlock()
	size, err := engine.CacheSize(engine.CacheDirectory(cacheDir))
	if err != nil {
		return fmt.Sprintf("ERROR: %v", err)
	}
	return fmt.Sprintf("%d", size)
}
func ClearCache(cacheDir string) string {
	bridgeMu.Lock()
	defer bridgeMu.Unlock()
	if engInstance != nil {
		return "ERROR: stop playback before clearing the stream cache"
	}
	discoveryHints.Clear()
	if err := os.RemoveAll(engine.CacheDirectory(cacheDir)); err != nil {
		return fmt.Sprintf("ERROR: %v", err)
	}
	return "ok"
}
