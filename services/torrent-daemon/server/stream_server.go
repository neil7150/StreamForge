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
	"strconv"
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
	mux.HandleFunc("/subtitle/", s.handleSubtitle)
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

type subtitleSource interface {
	OpenSubtitleReader(string, int, context.Context) (io.ReadSeekCloser, int64, string, error)
}

func (s *StreamServer) handleSubtitle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/subtitle/")
	token := s.engine.SessionToken(id)
	if id == "" || strings.Contains(id, "/") || token == "" || subtle.ConstantTimeCompare([]byte(token), []byte(r.URL.Query().Get("token"))) != 1 {
		http.NotFound(w, r)
		return
	}
	index, err := strconv.Atoi(r.URL.Query().Get("index"))
	source, ok := s.engine.(subtitleSource)
	if err != nil || index < 0 || !ok {
		http.NotFound(w, r)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	reader, size, _, err := source.OpenSubtitleReader(id, index, ctx)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer reader.Close()
	if size <= 0 || size > 2<<20 {
		http.Error(w, "Subtitle too large", http.StatusRequestEntityTooLarge)
		return
	}
	data, err := io.ReadAll(io.LimitReader(reader, (2<<20)+1))
	if err != nil {
		http.Error(w, "Subtitle unavailable", http.StatusServiceUnavailable)
		return
	}
	if len(data) > 2<<20 {
		http.Error(w, "Subtitle too large", http.StatusRequestEntityTooLarge)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write(data)
}
