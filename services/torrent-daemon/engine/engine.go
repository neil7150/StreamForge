package engine

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/anacrolix/torrent"
)

type StreamStats struct {
	InfoHash         string  `json:"infoHash"`
	Progress         float64 `json:"progress"`
	DownloadSpeed    int64   `json:"downloadSpeed"`
	UploadSpeed      int64   `json:"uploadSpeed"`
	Peers            int     `json:"peers"`
	Downloaded       int64   `json:"downloaded"`
	TotalSize        int64   `json:"totalSize"`
	BufferProgress   float64 `json:"bufferProgress"`
	Error            string  `json:"error,omitempty"`
	FirstVideoByteMs int64   `json:"firstVideoByteMs"`
}

type SessionInfo struct {
	SessionID             string     `json:"sessionId"`
	InfoHash              string     `json:"infoHash"`
	Name                  string     `json:"name"`
	Files                 []FileInfo `json:"files"`
	TotalSize             int64      `json:"totalSize"`
	SelectedFileIndex     int        `json:"selectedFileIndex"`
	RequiresFileSelection bool       `json:"requiresFileSelection"`
	StreamURL             string     `json:"streamURL"`
	Ready                 bool       `json:"ready"`
	Mode                  string     `json:"mode"`
	Token                 string     `json:"-"`
}

type streamSession struct {
	ctx                  context.Context
	cancel               context.CancelFunc
	torrent              *torrent.Torrent
	info                 SessionInfo
	sampled              time.Time
	downloaded, uploaded int64
	readers              map[*sessionReader]struct{}
	started              time.Time
	firstVideoByteMs     int64
}

type TorrentEngine struct {
	lifecycleMu       sync.Mutex
	client            *torrent.Client
	dataDir           string
	cache             *boundedCache
	mu                sync.Mutex
	sessions          map[string]*streamSession
	cancelledIDs      map[string]bool
	cancelledOrder    []string
	disposing, closed bool
}

var validSessionID = regexp.MustCompile(`^[a-zA-Z0-9-]{1,80}$`)

func CacheDirectory(parent string) string { return filepath.Join(parent, "streamforge-session-cache") }

func NewTorrentEngine(parent string, listenPort int) (*TorrentEngine, error) {
	if parent == "" {
		parent = os.TempDir()
	}
	root := CacheDirectory(parent)
	// This fixed app-owned directory contains disposable pieces only.
	if err := os.RemoveAll(root); err != nil {
		return nil, fmt.Errorf("clean abandoned stream cache: %w", err)
	}
	if err := os.MkdirAll(root, 0700); err != nil {
		return nil, err
	}
	cache := newBoundedCache(root, CacheLimitBytes)
	cfg := torrent.NewDefaultClientConfig()
	cfg.DataDir = root
	cfg.DefaultStorage = cache
	cfg.ListenPort = listenPort
	cfg.NoUpload = true
	cfg.EstablishedConnsPerTorrent = 24
	cfg.HalfOpenConnsPerTorrent = 8
	cfg.MaxUnverifiedBytes = 16 << 20
	cfg.DisableWebtorrent = true
	client, err := torrent.NewClient(cfg)
	if err != nil {
		return nil, err
	}
	return &TorrentEngine{client: client, dataDir: root, cache: cache, sessions: make(map[string]*streamSession)}, nil
}

func (e *TorrentEngine) PrepareSession(id, magnet string, fileIndex, season, episode int) (*SessionInfo, error) {
	if !validSessionID.MatchString(id) {
		return nil, errors.New("invalid session identifier")
	}
	ctx, cancel := context.WithCancel(context.Background())
	e.mu.Lock()
	if e.cancelledIDs[id] {
		e.mu.Unlock()
		cancel()
		return nil, errors.New("playback request cancelled")
	}
	if e.closed || e.disposing || len(e.sessions) > 0 {
		e.mu.Unlock()
		cancel()
		return nil, errors.New("another playback session is active or closing")
	}
	if failure := e.cache.Failure(); failure != nil {
		e.mu.Unlock()
		cancel()
		return nil, fmt.Errorf("cache unavailable: %w", failure)
	}
	t, err := e.client.AddMagnet(magnet)
	if err != nil {
		e.mu.Unlock()
		cancel()
		return nil, fmt.Errorf("invalid magnet: %w", err)
	}
	token := make([]byte, 24)
	if _, err = rand.Read(token); err != nil {
		e.mu.Unlock()
		cancel()
		t.Drop()
		return nil, err
	}
	session := &streamSession{ctx: ctx, cancel: cancel, torrent: t, sampled: time.Now(), started: time.Now(), readers: make(map[*sessionReader]struct{}), info: SessionInfo{SessionID: id, InfoHash: t.InfoHash().HexString(), SelectedFileIndex: -1, Token: hex.EncodeToString(token), Mode: "stream"}}
	e.sessions[id] = session
	e.cache.mu.Lock()
	e.cache.onFailure = cancel
	e.cache.mu.Unlock()
	go e.refreshEvictedPieces(id, session)
	e.mu.Unlock()
	timer := time.NewTimer(45 * time.Second)
	defer timer.Stop()
	select {
	case <-t.GotInfo():
	case <-ctx.Done():
		e.CancelSession(id)
		return nil, errors.New("playback request cancelled")
	case <-timer.C:
		e.CancelSession(id)
		return nil, errors.New("timed out waiting for torrent metadata")
	}
	e.mu.Lock()
	if e.sessions[id] != session || ctx.Err() != nil {
		e.mu.Unlock()
		return nil, errors.New("playback request cancelled")
	}
	files := t.Files()
	if len(files) > 10000 {
		e.mu.Unlock()
		e.CancelSession(id)
		return nil, errors.New("torrent contains too many files")
	}
	info := session.info
	info.Name = t.Name()
	for index, file := range files {
		kind := "other"
		if isVideo(file.DisplayPath()) {
			kind = "video"
		} else if isSubtitle(file.DisplayPath()) {
			kind = "subtitle"
		}
		info.Files = append(info.Files, FileInfo{Index: index, Name: filepath.Base(file.DisplayPath()), Path: file.DisplayPath(), Size: file.Length(), Type: kind})
	}
	selected, err := chooseFile(info.Files, fileIndex, season, episode)
	if err != nil {
		e.mu.Unlock()
		e.CancelSession(id)
		return nil, err
	}
	info.SelectedFileIndex = selected
	info.RequiresFileSelection = selected < 0
	info.Ready = selected >= 0
	if selected >= 0 {
		info.TotalSize = files[selected].Length()
	}
	// No File.Download(): native reader demand controls piece priorities.
	session.info = info
	e.mu.Unlock()
	return &info, nil
}

func (e *TorrentEngine) SelectFile(id string, index int) (*SessionInfo, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	session := e.sessions[id]
	if session == nil || session.ctx.Err() != nil {
		return nil, errors.New("session is no longer active")
	}
	if len(session.readers) > 0 {
		return nil, errors.New("stop the player before switching files")
	}
	if _, err := chooseFile(session.info.Files, index, 0, 0); err != nil {
		return nil, err
	}
	session.info.SelectedFileIndex = index
	session.info.TotalSize = session.info.Files[index].Size
	session.info.RequiresFileSelection = false
	session.info.Ready = true
	result := session.info
	return &result, nil
}

func (e *TorrentEngine) SessionToken(id string) string {
	e.mu.Lock()
	defer e.mu.Unlock()
	if session := e.sessions[id]; session != nil {
		return session.info.Token
	}
	return ""
}

type sessionReader struct {
	torrent.Reader
	ioMu        sync.Mutex
	ctx         context.Context
	cancel      context.CancelFunc
	stop        func() bool
	once        sync.Once
	release     func()
	window      *cacheWindow
	position    int64
	onFirstRead func()
}

func (r *sessionReader) Read(buffer []byte) (int, error) {
	r.ioMu.Lock()
	defer r.ioMu.Unlock()
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	n, err := r.Reader.ReadContext(r.ctx, buffer)
	if n > 0 && r.onFirstRead != nil {
		r.onFirstRead()
		r.onFirstRead = nil
	}
	r.position += int64(n)
	if r.window != nil {
		r.window.move(r.position)
	}
	return n, err
}
func (r *sessionReader) Seek(offset int64, whence int) (int64, error) {
	r.ioMu.Lock()
	defer r.ioMu.Unlock()
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	position, err := r.Reader.Seek(offset, whence)
	if err == nil {
		r.position = position
		if r.window != nil {
			r.window.move(position)
		}
	}
	return position, err
}
func (r *sessionReader) Close() error {
	r.cancel()
	var err error
	r.once.Do(func() {
		r.stop()
		r.ioMu.Lock()
		defer r.ioMu.Unlock()
		err = r.Reader.Close()
		if r.window != nil {
			r.window.close()
		}
		r.release()
	})
	return err
}

func (e *TorrentEngine) OpenReader(id string, request context.Context) (io.ReadSeekCloser, int64, string, error) {
	return e.openFileReader(id, -1, request)
}

func isSubtitle(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	return ext == ".srt" || ext == ".vtt"
}

// OpenSubtitleReader exposes only small text sidecars from the active session.
func (e *TorrentEngine) OpenSubtitleReader(id string, index int, request context.Context) (io.ReadSeekCloser, int64, string, error) {
	if index < 0 {
		return nil, 0, "", errors.New("invalid subtitle index")
	}
	return e.openFileReader(id, index, request)
}

func (e *TorrentEngine) openFileReader(id string, index int, request context.Context) (io.ReadSeekCloser, int64, string, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	session := e.sessions[id]
	if session == nil || !session.info.Ready || session.ctx.Err() != nil {
		return nil, 0, "", errors.New("stream is not ready")
	}
	if len(session.readers) >= 4 {
		return nil, 0, "", errors.New("too many concurrent media readers")
	}
	files := session.torrent.Files()
	if index < 0 {
		index = session.info.SelectedFileIndex
	} else if index >= len(files) || !isSubtitle(files[index].DisplayPath()) || files[index].Length() <= 0 || files[index].Length() > 2<<20 {
		return nil, 0, "", errors.New("unsupported or oversized subtitle")
	}
	file := files[index]
	ctx, cancel := context.WithCancel(request)
	raw := file.NewReader()
	raw.SetReadahead(readerReadahead)
	// Keep verified reads; do not expose unverified torrent chunks to the decoder.
	reader := &sessionReader{Reader: raw, ctx: ctx, cancel: cancel, stop: context.AfterFunc(session.ctx, cancel), window: e.cache.newWindow(file.Offset(), file.Length())}
	if index == session.info.SelectedFileIndex {
		reader.onFirstRead = func() {
			e.mu.Lock()
			defer e.mu.Unlock()
			if session.firstVideoByteMs == 0 && !session.started.IsZero() {
				session.firstVideoByteMs = max(1, time.Since(session.started).Milliseconds())
			}
		}
	}
	reader.release = func() { e.mu.Lock(); delete(session.readers, reader); e.mu.Unlock() }
	session.readers[reader] = struct{}{}
	return reader, file.Length(), file.DisplayPath(), nil
}

// Completion refreshes happen outside the storage lock. Holding the engine
// lock here prevents Drop from racing the public torrent completion API.
// Readers also recover a missing piece through the library's read retry path.
func (e *TorrentEngine) refreshEvictedPieces(id string, session *streamSession) {
	for {
		select {
		case <-session.ctx.Done():
			return
		case <-e.cache.changed:
		}
		e.mu.Lock()
		if e.sessions[id] != session || session.ctx.Err() != nil {
			e.mu.Unlock()
			return
		}
		for _, index := range e.cache.takeEvicted() {
			session.torrent.Piece(index).UpdateCompletion()
		}
		e.mu.Unlock()
	}
}

func (e *TorrentEngine) GetStats(id string) (*StreamStats, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	session := e.sessions[id]
	if session == nil {
		return nil, errors.New("session not active")
	}
	stats := session.torrent.Stats()
	down, up := stats.BytesReadData.Int64(), stats.BytesWrittenData.Int64()
	elapsed := time.Since(session.sampled).Seconds()
	result := &StreamStats{InfoHash: session.info.InfoHash, Peers: stats.ActivePeers, TotalSize: session.info.TotalSize}
	result.FirstVideoByteMs = session.firstVideoByteMs
	if elapsed > 0 {
		result.DownloadSpeed = int64(float64(max(0, down-session.downloaded)) / elapsed)
		result.UploadSpeed = int64(float64(max(0, up-session.uploaded)) / elapsed)
	}
	session.sampled = time.Now()
	session.downloaded = down
	session.uploaded = up
	if session.info.Ready {
		result.Downloaded = session.torrent.Files()[session.info.SelectedFileIndex].BytesCompleted()
		if result.TotalSize > 0 {
			result.Progress = float64(result.Downloaded) / float64(result.TotalSize)
		}
	}
	if failure := e.cache.Failure(); failure != nil {
		result.Error = failure.Error()
	}
	return result, nil
}

func (e *TorrentEngine) CancelSession(id string) {
	e.lifecycleMu.Lock()
	defer e.lifecycleMu.Unlock()
	e.cancelSession(id)
}

func (e *TorrentEngine) cancelSession(id string) {
	e.mu.Lock()
	if e.cancelledIDs == nil {
		e.cancelledIDs = make(map[string]bool)
	}
	if !e.cancelledIDs[id] {
		e.cancelledIDs[id] = true
		e.cancelledOrder = append(e.cancelledOrder, id)
		if len(e.cancelledOrder) > 1024 {
			delete(e.cancelledIDs, e.cancelledOrder[0])
			e.cancelledOrder = e.cancelledOrder[1:]
		}
	}
	session := e.sessions[id]
	if session == nil {
		e.mu.Unlock()
		return
	}
	delete(e.sessions, id)
	e.disposing = true
	session.cancel()
	readers := make([]*sessionReader, 0, len(session.readers))
	for reader := range session.readers {
		readers = append(readers, reader)
	}
	e.mu.Unlock()
	for _, reader := range readers {
		reader.Close()
	}
	session.torrent.Drop()
	e.mu.Lock()
	// Drop waits for torrent resources before piece deletion/reset.
	e.cache.mu.Lock()
	cleanupErr := os.RemoveAll(e.dataDir)
	if cleanupErr == nil {
		cleanupErr = os.MkdirAll(e.dataDir, 0700)
	}
	if cleanupErr == nil {
		e.cache.pieces = make(map[string]*cachedPiece)
		e.cache.reserved = 0
		e.cache.lru.Init()
		clear(e.cache.evicted)
		clear(e.cache.windows)
	}
	e.cache.failure = cleanupErr
	e.cache.onFailure = nil
	e.cache.mu.Unlock()
	e.disposing = false
	e.mu.Unlock()
}

func (e *TorrentEngine) Close() error {
	e.lifecycleMu.Lock()
	defer e.lifecycleMu.Unlock()
	e.mu.Lock()
	if e.closed {
		e.mu.Unlock()
		return nil
	}
	e.closed = true
	ids := make([]string, 0, len(e.sessions))
	for id := range e.sessions {
		ids = append(ids, id)
	}
	e.mu.Unlock()
	for _, id := range ids {
		e.cancelSession(id)
	}
	e.client.Close()
	e.cache.Close()
	return os.RemoveAll(e.dataDir)
}
