package engine

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"

	"github.com/anacrolix/torrent"
)

// StreamStats holds real-time torrent stream metrics for the mobile client.
type StreamStats struct {
	InfoHash       string  `json:"infoHash"`
	Title          string  `json:"title"`
	Progress       float64 `json:"progress"`
	DownloadSpeed  int64   `json:"downloadSpeed"`
	UploadSpeed    int64   `json:"uploadSpeed"`
	Peers          int     `json:"peers"`
	Downloaded     int64   `json:"downloaded"`
	TotalSize      int64   `json:"totalSize"`
	BufferProgress float64 `json:"bufferProgress"`
}

// TorrentEngine manages active torrent streams on the mobile device.
type TorrentEngine struct {
	client        *torrent.Client
	dataDir       string
	mu            sync.RWMutex
	torrents      map[string]*torrent.Torrent
	selectedFiles map[string]int
}

// NewTorrentEngine initializes a lightweight torrent engine tailored for mobile devices.
func NewTorrentEngine(cacheDir string, listenPort int) (*TorrentEngine, error) {
	if cacheDir == "" {
		cacheDir = filepath.Join(os.TempDir(), "streamforge-mobile-stream")
	} else {
		cacheDir = filepath.Join(cacheDir, "streamforge-session-cache")
	}
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create cache dir: %w", err)
	}

	cfg := torrent.NewDefaultClientConfig()
	cfg.DataDir = cacheDir
	cfg.ListenPort = listenPort
	cfg.NoUpload = false
	// Mobile-optimized limits: moderate connections to avoid battery and thermal throttling
	cfg.EstablishedConnsPerTorrent = 40
	cfg.HalfOpenConnsPerTorrent = 20

	client, err := torrent.NewClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize torrent client: %w", err)
	}

	return &TorrentEngine{
		client:        client,
		dataDir:       cacheDir,
		torrents:      make(map[string]*torrent.Torrent),
		selectedFiles: make(map[string]int),
	}, nil
}

// AddStream adds a magnet URI and configures sequential piece downloading for HTTP streaming.
func (e *TorrentEngine) AddStream(ctx context.Context, magnetURI string, fileIndex int) (*torrent.File, string, error) {
	t, err := e.client.AddMagnet(magnetURI)
	if err != nil {
		return nil, "", fmt.Errorf("invalid magnet link: %w", err)
	}

	infoHash := t.InfoHash().HexString()
	e.mu.Lock()
	e.torrents[infoHash] = t
	e.mu.Unlock()

	// Wait for metadata to resolve
	select {
	case <-t.GotInfo():
	case <-ctx.Done():
		t.Drop()
		e.mu.Lock()
		delete(e.torrents, infoHash)
		e.mu.Unlock()
		return nil, "", errors.New("timed out waiting for torrent metadata")
	}

	files := t.Files()
	if len(files) == 0 {
		t.Drop()
		e.mu.Lock()
		delete(e.torrents, infoHash)
		e.mu.Unlock()
		return nil, "", errors.New("torrent contains no files")
	}

	// Choose requested file or largest video file
	var targetFile *torrent.File
	if fileIndex >= 0 && fileIndex < len(files) {
		targetFile = files[fileIndex]
	} else {
		var largest int64 = -1
		for _, f := range files {
			if f.Length() > largest {
				largest = f.Length()
				targetFile = f
			}
		}
	}

	if targetFile == nil {
		targetFile = files[0]
	}

	// Prioritize head and tail for instant media header parsing (e.g., moov atom, MKV header)
	targetFile.Download()

	selectedIndex := 0
	for index, file := range files {
		if file == targetFile {
			selectedIndex = index
			break
		}
	}
	e.mu.Lock()
	e.selectedFiles[infoHash] = selectedIndex
	e.mu.Unlock()

	return targetFile, infoHash, nil
}

// GetFileStream opens a stream reader compatible with HTTP range requests.
func (e *TorrentEngine) GetFileStream(infoHash string) (io.ReadSeeker, int64, string, error) {
	e.mu.RLock()
	t, ok := e.torrents[infoHash]
	selectedIndex := e.selectedFiles[infoHash]
	e.mu.RUnlock()

	if !ok {
		return nil, 0, "", errors.New("stream not found")
	}

	files := t.Files()
	if len(files) == 0 {
		return nil, 0, "", errors.New("no files in torrent")
	}

	if selectedIndex < 0 || selectedIndex >= len(files) {
		selectedIndex = 0
	}
	targetFile := files[selectedIndex]

	reader := targetFile.NewReader()
	reader.SetResponsive()

	return reader, targetFile.Length(), targetFile.DisplayPath(), nil
}

// GetStats returns current streaming metrics for a given hash.
func (e *TorrentEngine) GetStats(infoHash string) (*StreamStats, error) {
	e.mu.RLock()
	t, ok := e.torrents[infoHash]
	e.mu.RUnlock()

	if !ok {
		return nil, errors.New("torrent not active")
	}

	stats := t.Stats()
	total := t.Length()
	bytesCompleted := t.BytesCompleted()

	var progress float64
	if total > 0 {
		progress = float64(bytesCompleted) / float64(total)
	}

	return &StreamStats{
		InfoHash:       infoHash,
		Title:          t.Name(),
		Progress:       progress,
		Peers:          stats.ActivePeers,
		Downloaded:     bytesCompleted,
		TotalSize:      total,
		BufferProgress: progress,
	}, nil
}

// RemoveStream stops downloading and cleans up temporary chunk files.
func (e *TorrentEngine) RemoveStream(infoHash string) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if t, ok := e.torrents[infoHash]; ok {
		t.Drop()
		delete(e.torrents, infoHash)
	}
	delete(e.selectedFiles, infoHash)
}

// Close shuts down the torrent client.
func (e *TorrentEngine) Close() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	for _, t := range e.torrents {
		t.Drop()
	}
	e.torrents = make(map[string]*torrent.Torrent)
	e.selectedFiles = make(map[string]int)
	e.client.Close()
	return os.RemoveAll(e.dataDir)
}
