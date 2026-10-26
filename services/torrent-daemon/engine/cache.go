package engine

import (
	"container/list"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"

	"github.com/anacrolix/torrent/metainfo"
	"github.com/anacrolix/torrent/storage"
)

const CacheLimitBytes int64 = 512 << 20
const readerReadahead int64 = 8 << 20
const maxPieceBytes int64 = 64 << 20

var ErrCacheFull = errors.New("stream cache is full of active or unfinished pieces; retry or choose another source")

// Only verified pieces outside all reader windows can be evicted. Incomplete
// pieces stay resident through hashing. No torrent calls are made with mu held.
type boundedCache struct {
	mu              sync.Mutex
	directory       string
	limit, reserved int64
	pieces          map[string]*cachedPiece
	failure         error
	closed          bool
	onFailure       func()
	lru             list.List
	windows         map[*cacheWindow]struct{}
	evicted         map[int]struct{}
	changed         chan struct{}
}

type cachedPiece struct {
	cache              *boundedCache
	path               string
	length             int64
	reserved, complete bool
	index              int
	offset             int64
	recent             *list.Element
}

type cacheWindow struct {
	cache      *boundedCache
	base, size int64
	begin, end int64
}

func newBoundedCache(directory string, limit int64) *boundedCache {
	return &boundedCache{directory: directory, limit: limit, pieces: make(map[string]*cachedPiece),
		windows: make(map[*cacheWindow]struct{}), evicted: make(map[int]struct{}), changed: make(chan struct{}, 1)}
}

func (c *boundedCache) OpenTorrent(ctx context.Context, info *metainfo.Info, hash metainfo.Hash) (storage.TorrentImpl, error) {
	if err := ctx.Err(); err != nil {
		return storage.TorrentImpl{}, err
	}
	if info.PieceLength <= 0 || info.PieceLength > min(maxPieceBytes, c.limit) {
		return storage.TorrentImpl{}, errors.New("source piece size exceeds the mobile cache allowance; choose another source")
	}
	if info.NumPieces() > 32768 {
		return storage.TorrentImpl{}, errors.New("torrent has too many pieces for the mobile cache")
	}
	dir := filepath.Join(c.directory, hash.HexString())
	if err := os.MkdirAll(dir, 0700); err != nil {
		return storage.TorrentImpl{}, err
	}
	capacity := func() (int64, bool) { return c.limit, true }
	return storage.TorrentImpl{Capacity: &capacity, Piece: func(p metainfo.Piece) storage.PieceImpl {
		c.mu.Lock()
		defer c.mu.Unlock()
		key := fmt.Sprintf("%s-%d", hash.HexString(), p.Index())
		if existing := c.pieces[key]; existing != nil {
			return existing
		}
		piece := &cachedPiece{cache: c, path: filepath.Join(dir, fmt.Sprintf("%d.piece", p.Index())), length: p.Length(), index: p.Index(), offset: p.Offset()}
		c.pieces[key] = piece
		return piece
	}, Close: func() error { return nil }}, nil
}

func (p *cachedPiece) ReadAt(buffer []byte, offset int64) (int, error) {
	c := p.cache
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return 0, os.ErrClosed
	}
	file, err := os.Open(p.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			p.invalidate()
			if p.reserved {
				c.reserved -= p.length
				p.reserved = false
			}
			return 0, io.EOF
		}
		c.fail(err)
		return 0, err
	}
	defer file.Close()
	if p.recent != nil {
		c.lru.MoveToBack(p.recent)
	}
	n, err := file.ReadAt(buffer, offset)
	if errors.Is(err, io.EOF) && int64(n) < min(int64(len(buffer)), max(0, p.length-offset)) {
		// Android may reclaim cache files under storage pressure. Do not leave
		// a missing/truncated piece marked complete and spin on read retries.
		p.invalidate()
	} else if err != nil && !errors.Is(err, io.EOF) {
		c.fail(err)
	}
	return n, err
}

func (p *cachedPiece) WriteAt(buffer []byte, offset int64) (int, error) {
	c := p.cache
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return 0, os.ErrClosed
	}
	if offset < 0 || offset > p.length || int64(len(buffer)) > p.length-offset {
		return 0, errors.New("piece write outside bounds")
	}
	if len(buffer) == 0 {
		return 0, nil
	}
	if !p.reserved {
		if err := c.makeRoom(p.length); err != nil {
			c.fail(err)
			return 0, err
		}
		c.reserved += p.length
		p.reserved = true
	}
	file, err := os.OpenFile(p.path, os.O_WRONLY|os.O_CREATE, 0600)
	if err != nil {
		c.fail(err)
		return 0, err
	}
	defer file.Close()
	n, err := file.WriteAt(buffer, offset)
	if err != nil {
		c.fail(err)
	}
	return n, err
}

func (p *cachedPiece) MarkComplete() error {
	p.cache.mu.Lock()
	defer p.cache.mu.Unlock()
	if p.cache.closed {
		return os.ErrClosed
	}
	if !p.reserved {
		return os.ErrNotExist
	}
	p.complete = true
	if p.recent == nil {
		p.recent = p.cache.lru.PushBack(p)
	} else {
		p.cache.lru.MoveToBack(p.recent)
	}
	return nil
}
func (p *cachedPiece) MarkNotComplete() error {
	p.cache.mu.Lock()
	defer p.cache.mu.Unlock()
	p.complete = false
	if p.recent != nil {
		p.cache.lru.Remove(p.recent)
		p.recent = nil
	}
	return nil
}
func (p *cachedPiece) Completion() storage.Completion {
	p.cache.mu.Lock()
	defer p.cache.mu.Unlock()
	return storage.Completion{Complete: p.complete, Ok: true}
}
func (c *boundedCache) Failure() error { c.mu.Lock(); defer c.mu.Unlock(); return c.failure }
func (c *boundedCache) Close()         { c.mu.Lock(); defer c.mu.Unlock(); c.closed = true }

// Called only under mu. Reservations count full piece lengths, including sparse
// and unfinished files, so disk payload cannot exceed the budget mid-write.
func (c *boundedCache) makeRoom(length int64) error {
	if length > c.limit {
		return ErrCacheFull
	}
	for item := c.lru.Front(); length > c.limit-c.reserved && item != nil; {
		next := item.Next()
		piece := item.Value.(*cachedPiece)
		pinned := false
		for window := range c.windows {
			if piece.offset < window.end && piece.offset+piece.length > window.begin {
				pinned = true
				break
			}
		}
		if !pinned {
			if err := os.Remove(piece.path); err != nil && !errors.Is(err, os.ErrNotExist) {
				return fmt.Errorf("evict stream piece: %w", err)
			}
			piece.invalidate()
			piece.reserved = false
			c.reserved -= piece.length
		}
		item = next
	}
	if length > c.limit-c.reserved {
		return ErrCacheFull
	}
	return nil
}

// Called under cache.mu after removal, or on discovering externally reclaimed
// bytes. Storage completion changes synchronously; client refresh is deferred.
func (p *cachedPiece) invalidate() {
	c := p.cache
	wasComplete := p.complete
	p.complete = false
	if p.recent != nil {
		c.lru.Remove(p.recent)
		p.recent = nil
	}
	if wasComplete {
		c.evicted[p.index] = struct{}{}
		select {
		case c.changed <- struct{}{}:
		default:
		}
	}
}

func (c *boundedCache) fail(err error) {
	c.failure = err
	if c.onFailure != nil {
		c.onFailure()
	}
}

func (c *boundedCache) newWindow(base, size int64) *cacheWindow {
	w := &cacheWindow{cache: c, base: base, size: size}
	c.mu.Lock()
	c.windows[w] = struct{}{}
	c.mu.Unlock()
	w.move(0)
	return w
}

func (w *cacheWindow) move(position int64) {
	w.cache.mu.Lock()
	defer w.cache.mu.Unlock()
	position = max(0, min(position, w.size))
	w.begin = w.base + position
	w.end = w.base + min(w.size, position+readerReadahead)
}

func (w *cacheWindow) close() {
	w.cache.mu.Lock()
	defer w.cache.mu.Unlock()
	delete(w.cache.windows, w)
}

func (c *boundedCache) takeEvicted() []int {
	c.mu.Lock()
	defer c.mu.Unlock()
	indexes := make([]int, 0, len(c.evicted))
	for index := range c.evicted {
		indexes = append(indexes, index)
	}
	clear(c.evicted)
	return indexes
}

func CacheSize(cacheRoot string) (int64, error) {
	var total int64
	err := filepath.WalkDir(cacheRoot, func(path string, entry os.DirEntry, err error) error {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return errors.New("unexpected symlink in stream cache")
		}
		if !entry.IsDir() {
			info, err := entry.Info()
			if err != nil {
				return err
			}
			total += info.Size()
		}
		return nil
	})
	return total, err
}
