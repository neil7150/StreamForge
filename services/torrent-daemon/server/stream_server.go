package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/streamforge/services/torrent-daemon/engine"
)

// StreamServer provides HTTP localhost endpoints for mobile video players.
type StreamServer struct {
	engine *engine.TorrentEngine
	server *http.Server
	port   int
}

// NewStreamServer creates a new local HTTP streaming server on 127.0.0.1:port.
func NewStreamServer(eng *engine.TorrentEngine, port int) *StreamServer {
	if port <= 0 {
		port = 8888
	}

	s := &StreamServer{
		engine: eng,
		port:   port,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/stream/", s.handleStream)
	mux.HandleFunc("/stats/", s.handleStats)
	mux.HandleFunc("/add", s.handleAdd)
	mux.HandleFunc("/cleanup/", s.handleCleanup)
	mux.HandleFunc("/health", s.handleHealth)

	s.server = &http.Server{
		Addr:         fmt.Sprintf("127.0.0.1:%d", port),
		Handler:      mux,
		ReadTimeout:  30 * time.Minute,
		WriteTimeout: 30 * time.Minute,
	}

	return s
}

// Start runs the HTTP server in the background.
func (s *StreamServer) Start() error {
	return s.server.ListenAndServe()
}

// Stop terminates the server.
func (s *StreamServer) Stop(ctx context.Context) error {
	return s.server.Shutdown(ctx)
}

func (s *StreamServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "version": "1.0.0"})
}

func (s *StreamServer) handleAdd(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		MagnetURI string `json:"magnetURI"`
		FileIndex int    `json:"fileIndex"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	file, infoHash, err := s.engine.AddStream(ctx, req.MagnetURI, req.FileIndex)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	streamURL := fmt.Sprintf("http://127.0.0.1:%d/stream/%s", s.port, infoHash)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"infoHash":  infoHash,
		"fileName":  file.DisplayPath(),
		"fileSize":  file.Length(),
		"streamURL": streamURL,
	})
}

// handleStream serves standard HTTP range requests for the video file.
func (s *StreamServer) handleStream(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/stream/")
	parts := strings.Split(path, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.Error(w, "Missing infoHash", http.StatusBadRequest)
		return
	}
	infoHash := parts[0]

	reader, _, filename, err := s.engine.GetFileStream(infoHash)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	if closer, ok := reader.(io.Closer); ok {
		defer closer.Close()
	}

	// Content-Type detection
	ext := filepath.Ext(filename)
	contentType := mime.TypeByExtension(ext)
	if contentType == "" {
		contentType = "video/mp4"
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	http.ServeContent(w, r, filename, time.Now(), reader)
}

func (s *StreamServer) handleStats(w http.ResponseWriter, r *http.Request) {
	infoHash := strings.TrimPrefix(r.URL.Path, "/stats/")
	stats, err := s.engine.GetStats(infoHash)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func (s *StreamServer) handleCleanup(w http.ResponseWriter, r *http.Request) {
	infoHash := strings.TrimPrefix(r.URL.Path, "/cleanup/")
	s.engine.RemoveStream(infoHash)
	w.WriteHeader(http.StatusNoContent)
}
