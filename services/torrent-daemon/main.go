package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/streamforge/services/torrent-daemon/engine"
	"github.com/streamforge/services/torrent-daemon/server"
)

func main() {
	port := flag.Int("port", 8888, "HTTP streaming server port")
	cacheDir := flag.String("cache", "", "Temporary directory for stream cache")
	flag.Parse()

	log.Printf("[StreamForge Daemon] Initializing torrent streaming engine on port %d...", *port)

	eng, err := engine.NewTorrentEngine(*cacheDir, *port+1)
	if err != nil {
		log.Fatalf("Failed to initialize torrent engine: %v", err)
	}
	defer eng.Close()

	srv := server.NewStreamServer(eng, *port)

	go func() {
		log.Printf("[StreamForge Daemon] HTTP range streaming server listening on http://127.0.0.1:%d", *port)
		if err := srv.Start(); err != nil {
			log.Printf("Server stopped: %v", err)
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("[StreamForge Daemon] Shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Stop(ctx)
}
