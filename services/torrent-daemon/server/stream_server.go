package server

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"time"
)

type StreamSource interface {
	SessionToken(string) string
	OpenReader(string, context.Context) (io.ReadSeekCloser, int64, string, error)
}

type StreamServer struct {
	engine StreamSource
	server *http.Server
	port   int
}

func NewStreamServer(source StreamSource, port int) *StreamServer {
	if port <= 0 {
		port = 8888
	}
	s := &StreamServer{engine: source, port: port}
	mux := http.NewServeMux()
	mux.HandleFunc("/stream/", s.handleStream)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(map[string]any{"status": "ok", "protocol": 2})
	})
	// Administration and statistics are native-only; no unauthenticated HTTP controls.
	s.server = &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", port), Handler: mux, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second}
	return s
}

// Listen binds synchronously so startup cannot succeed with an occupied port.
func (s *StreamServer) Listen() error {
	listener, err := net.Listen("tcp4", s.server.Addr)
	if err != nil {
		return err
	}
	go func() { _ = s.server.Serve(listener) }()
	return nil
}
func (s *StreamServer) Start() error { return s.server.ListenAndServe() }
func (s *StreamServer) Stop(ctx context.Context) error {
	if err := s.server.Shutdown(ctx); err != nil {
		_ = s.server.Close()
		return err
	}
	return nil
}

func (s *StreamServer) handleStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/stream/")
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(w, r)
		return
	}
	token := s.engine.SessionToken(id)
	supplied := r.URL.Query().Get("token")
	if token == "" || subtle.ConstantTimeCompare([]byte(token), []byte(supplied)) != 1 {
		http.NotFound(w, r)
		return
	}
	reader, _, name, err := s.engine.OpenReader(id, r.Context())
	if err != nil {
		http.Error(w, "Stream unavailable", http.StatusNotFound)
		return
	}
	defer reader.Close()
	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(name)))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, name, time.Time{}, reader)
}
