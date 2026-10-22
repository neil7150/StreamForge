package engine

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/anacrolix/torrent/metainfo"
	"github.com/anacrolix/torrent/storage"
)

func TestCacheProtectsActiveReadersAndRejectsWritesBeyondBudget(t *testing.T) {
	root := t.TempDir()
	cache := newBoundedCache(root, 8)
	first := &cachedPiece{cache: cache, path: filepath.Join(root, "a"), length: 8}
	second := &cachedPiece{cache: cache, path: filepath.Join(root, "b"), length: 8}
	if _, err := first.WriteAt([]byte("12345678"), 0); err != nil {
		t.Fatal(err)
	}
	first.MarkComplete()
	window := cache.newWindow(0, 8)
	defer window.close()
	if _, err := second.WriteAt([]byte("9"), 0); !errors.Is(err, ErrCacheFull) {
		t.Fatalf("expected cap error: %v", err)
	}
	if !first.Completion().Complete {
		t.Fatal("completed piece was silently invalidated")
	}
	if _, err := os.Stat(second.path); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("over-budget file was created")
	}
	if size, err := CacheSize(root); size != 8 || err != nil {
		t.Fatalf("size %d %v", size, err)
	}
	cache.Close()
	if _, err := first.WriteAt([]byte("x"), 0); !errors.Is(err, os.ErrClosed) {
		t.Fatal("write after close")
	}
}

func cacheFixture(t *testing.T, budget int64, count int) (*boundedCache, []storage.PieceImpl) {
	t.Helper()
	cache := newBoundedCache(t.TempDir(), budget)
	info := &metainfo.Info{Name: "fixture.mp4", Length: int64(count * 8), PieceLength: 8, Pieces: make([]byte, count*20)}
	store, err := cache.OpenTorrent(info, metainfo.Hash{})
	if err != nil {
		t.Fatal(err)
	}
	pieces := make([]storage.PieceImpl, count)
	for i := range pieces {
		pieces[i] = store.Piece(info.Piece(i))
	}
	return cache, pieces
}

func writeVerified(t *testing.T, piece storage.PieceImpl, value string) {
	t.Helper()
	if _, err := piece.WriteAt([]byte(value), 0); err != nil {
		t.Fatal(err)
	}
	if err := piece.MarkComplete(); err != nil {
		t.Fatal(err)
	}
}

func TestRollingCacheStreamsBeyondBudgetAndReclaimsOldPieces(t *testing.T) {
	cache, pieces := cacheFixture(t, 16, 8)
	for i, piece := range pieces {
		writeVerified(t, piece, "12345678")
		if size, err := CacheSize(cache.directory); err != nil || size > 16 {
			t.Fatalf("piece %d disk payload %d: %v", i, size, err)
		}
		if cache.reserved > cache.limit {
			t.Fatal("reservation exceeded budget")
		}
	}
	if pieces[0].Completion().Complete || !pieces[7].Completion().Complete {
		t.Fatal("eviction did not invalidate completion")
	}
	if n, err := pieces[0].ReadAt(make([]byte, 8), 0); n != 0 || !errors.Is(err, io.EOF) {
		t.Fatal("evicted bytes remained readable")
	}
	if err := pieces[0].MarkComplete(); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("missing piece was marked complete")
	}
	// A backward seek can download an evicted piece into the same budget.
	writeVerified(t, pieces[0], "abcdefgh")
	result := make([]byte, 8)
	if _, err := pieces[0].ReadAt(result, 0); err != nil || string(result) != "abcdefgh" {
		t.Fatalf("redownload: %q %v", result, err)
	}
	if len(cache.takeEvicted()) == 0 || len(cache.takeEvicted()) != 0 {
		t.Fatal("completion notifications were not drained")
	}
}

func TestCacheEvictsLeastRecentlyReadAndHonorsMultipleWindows(t *testing.T) {
	cache, pieces := cacheFixture(t, 24, 5)
	for _, piece := range pieces[:3] {
		writeVerified(t, piece, "12345678")
	}
	pieces[0].ReadAt(make([]byte, 1), 0)
	writeVerified(t, pieces[3], "12345678")
	if pieces[1].Completion().Complete || !pieces[0].Completion().Complete {
		t.Fatal("recently used piece evicted before older piece")
	}
	head := cache.newWindow(0, 8)
	tail := cache.newWindow(24, 8)
	writeVerified(t, pieces[4], "12345678")
	if !pieces[0].Completion().Complete || !pieces[3].Completion().Complete || pieces[2].Completion().Complete {
		t.Fatal("an active reader window was evicted")
	}
	head.close()
	tail.close()
	writeVerified(t, pieces[1], "12345678")
	if pieces[0].Completion().Complete {
		t.Fatal("closed reader continued pinning old data")
	}
}

func TestCacheReservesWholeUnfinishedPieceAndFailsSafelyOnEvictionError(t *testing.T) {
	cache, pieces := cacheFixture(t, 8, 2)
	pieces[0].WriteAt([]byte("x"), 0)
	if _, err := pieces[1].WriteAt([]byte("y"), 0); !errors.Is(err, ErrCacheFull) {
		t.Fatalf("unfinished piece was evicted: %v", err)
	}
	if cache.reserved != 8 {
		t.Fatal("partial piece reservation did not count full length")
	}
	// A deletion failure must not release its disk reservation or claim success.
	other, otherPieces := cacheFixture(t, 8, 2)
	writeVerified(t, otherPieces[0], "12345678")
	path := otherPieces[0].(*cachedPiece).path
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(path, "occupied"), []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := otherPieces[1].WriteAt([]byte("y"), 0); err == nil {
		t.Fatal("eviction error was ignored")
	}
	if other.reserved != 8 || other.Failure() == nil {
		t.Fatal("failed eviction released reservation or hid failure")
	}
}

func TestCacheRejectsOversizePiecesAndOutOfBoundsWrites(t *testing.T) {
	cache, pieces := cacheFixture(t, 8, 1)
	if _, err := cache.OpenTorrent(&metainfo.Info{PieceLength: maxPieceBytes + 1}, metainfo.Hash{}); err == nil {
		t.Fatal("oversize piece accepted")
	}
	for _, offset := range []int64{-1, 8, 9} {
		if _, err := pieces[0].WriteAt([]byte("xx"), offset); err == nil {
			t.Fatal("out of bounds write accepted")
		}
	}
	if cache.reserved != 0 {
		t.Fatal("invalid write reserved disk")
	}
}

func TestCacheDetectsExternallyRemovedAndTruncatedPieces(t *testing.T) {
	cache, pieces := cacheFixture(t, 16, 2)
	for _, piece := range pieces {
		writeVerified(t, piece, "12345678")
	}
	if err := os.Remove(pieces[0].(*cachedPiece).path); err != nil {
		t.Fatal(err)
	}
	if n, err := pieces[0].ReadAt(make([]byte, 8), 0); n != 0 || !errors.Is(err, io.EOF) {
		t.Fatal("missing piece read did not fail")
	}
	if pieces[0].Completion().Complete || cache.reserved != 8 {
		t.Fatal("missing piece remained complete or reserved")
	}
	if err := os.Truncate(pieces[1].(*cachedPiece).path, 2); err != nil {
		t.Fatal(err)
	}
	if n, err := pieces[1].ReadAt(make([]byte, 8), 0); n != 2 || !errors.Is(err, io.EOF) {
		t.Fatal("truncated piece read did not fail")
	}
	if pieces[1].Completion().Complete || cache.reserved != 8 {
		t.Fatal("truncated piece retained completion or lost reservation")
	}
	writeVerified(t, pieces[0], "abcdefgh")
	writeVerified(t, pieces[1], "abcdefgh")
	if len(cache.takeEvicted()) != 2 || cache.reserved != 16 {
		t.Fatal("recovery did not preserve completion notifications and bounds")
	}
}
