package engine

import (
	"bytes"
	"context"
	"crypto/sha256"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
	"github.com/anacrolix/torrent/storage"
)

// The fixture owns its single read-only file handle explicitly. The app uses
// boundedCache; the seeder must not depend on a library's default part-file pool.
type fixtureStorage struct{ file *os.File }
type fixturePiece struct{ *io.SectionReader }

func (p fixturePiece) WriteAt([]byte, int64) (int, error) { return 0, os.ErrPermission }
func (p fixturePiece) MarkComplete() error                { return nil }
func (p fixturePiece) MarkNotComplete() error             { return nil }
func (p fixturePiece) Completion() storage.Completion {
	return storage.Completion{Ok: true, Complete: true}
}
func (s fixtureStorage) OpenTorrent(ctx context.Context, _ *metainfo.Info, _ metainfo.Hash) (storage.TorrentImpl, error) {
	if err := ctx.Err(); err != nil {
		return storage.TorrentImpl{}, err
	}
	return storage.TorrentImpl{Piece: func(p metainfo.Piece) storage.PieceImpl {
		return fixturePiece{io.NewSectionReader(s.file, p.Offset(), p.Length())}
	}, Close: s.file.Close}, nil
}

func localPeerConfig(directory string) *torrent.ClientConfig {
	cfg := torrent.NewDefaultClientConfig()
	cfg.DataDir = directory
	cfg.ListenHost = func(string) string { return "127.0.0.1" }
	cfg.ListenPort = 0
	cfg.NoDHT = true
	cfg.DisableTrackers = true
	cfg.DisablePEX = true
	cfg.DisableUTP = true
	cfg.DisableIPv6 = true
	cfg.DisableWebtorrent = true
	cfg.NoDefaultPortForwarding = true
	return cfg
}

// A synthetic local seeder makes this independent of trackers, Internet access,
// media rights and public peer availability. Exercise the actual torrent reader
// and completion refresh path with production-sized read-ahead.
func TestLocalTorrentStreamsBeyondCacheAndSeeksBack(t *testing.T) {
	seedRoot := t.TempDir()
	fixturePath := filepath.Join(seedRoot, "fixture.mp4")
	file, err := os.Create(fixturePath)
	if err != nil {
		t.Fatal(err)
	}
	expected := sha256.New()
	block := make([]byte, 1<<20)
	for index := range block {
		block[index] = byte(index*31 + index/257)
	}
	for index := 0; index < 32; index++ {
		if _, err := io.MultiWriter(file, expected).Write(block); err != nil {
			t.Fatal(err)
		}
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	info := metainfo.Info{PieceLength: 1 << 20}
	if err := info.BuildFromFilePath(fixturePath); err != nil {
		t.Fatal(err)
	}
	infoBytes, err := bencode.Marshal(info)
	if err != nil {
		t.Fatal(err)
	}
	meta := &metainfo.MetaInfo{InfoBytes: infoBytes}
	seedConfig := localPeerConfig(seedRoot)
	seedConfig.Seed = true
	seedFile, err := os.Open(fixturePath)
	if err != nil {
		t.Fatal(err)
	}
	defer seedFile.Close()
	seedConfig.DefaultStorage = fixtureStorage{seedFile}
	seeder, err := torrent.NewClient(seedConfig)
	if err != nil {
		t.Fatal(err)
	}
	defer seeder.Close()
	seedTorrent, err := seeder.AddTorrent(meta)
	if err != nil {
		t.Fatal(err)
	}
	seedTorrent.VerifyData()

	cache := newBoundedCache(t.TempDir(), 12<<20)
	config := localPeerConfig(cache.directory)
	config.DefaultStorage = cache
	config.NoUpload = true
	config.MaxUnverifiedBytes = 16 << 20
	client, err := torrent.NewClient(config)
	if err != nil {
		t.Fatal(err)
	}
	engine := &TorrentEngine{client: client, cache: cache, dataDir: cache.directory, sessions: make(map[string]*streamSession)}
	defer engine.Close()
	leecher, err := client.AddTorrent(meta)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	session := &streamSession{ctx: ctx, cancel: cancel, torrent: leecher,
		info: SessionInfo{Ready: true, SelectedFileIndex: 0}, readers: make(map[*sessionReader]struct{})}
	engine.sessions["fixture"] = session
	cache.onFailure = cancel
	go engine.refreshEvictedPieces("fixture", session)
	leecher.AddClientPeer(seeder)
	reader, size, _, err := engine.OpenReader("fixture", ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	actual := sha256.New()
	if copied, err := io.Copy(actual, reader); err != nil || copied != size {
		t.Fatalf("streamed %d/%d bytes: %v (cache: %v)", copied, size, err, cache.Failure())
	}
	if !bytes.Equal(expected.Sum(nil), actual.Sum(nil)) {
		t.Fatal("stream bytes differ from fixture")
	}
	cache.mu.Lock()
	first := cache.pieces[meta.HashInfoBytes().HexString()+"-0"]
	wasEvicted := first != nil && !first.reserved
	cache.mu.Unlock()
	if !wasEvicted {
		t.Fatal("fixture did not exercise eviction of the beginning")
	}
	if _, err := reader.Seek(0, io.SeekStart); err != nil {
		t.Fatal(err)
	}
	back := make([]byte, 32<<10)
	if _, err := io.ReadFull(reader, back); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(back, block[:len(back)]) {
		t.Fatal("backward seek returned wrong bytes")
	}
	if _, err := reader.Seek(size-int64(len(back)), io.SeekStart); err != nil {
		t.Fatal(err)
	}
	if _, err := io.ReadFull(reader, back); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(back, block[len(block)-len(back):]) {
		t.Fatal("tail seek returned wrong bytes")
	}
	// A container can probe the beginning and tail through separate HTTP readers.
	head, _, _, err := engine.OpenReader("fixture", ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer head.Close()
	finished := make(chan error, 2)
	for _, probe := range []struct {
		reader io.ReadSeekCloser
		offset int64
		want   []byte
	}{{head, 0, block[:len(back)]}, {reader, size - int64(len(back)), block[len(block)-len(back):]}} {
		go func() {
			result := make([]byte, len(probe.want))
			for attempt := 0; attempt < 5; attempt++ {
				if _, err := probe.reader.Seek(probe.offset, io.SeekStart); err != nil {
					finished <- err
					return
				}
				if _, err := io.ReadFull(probe.reader, result); err != nil {
					finished <- err
					return
				}
				if !bytes.Equal(result, probe.want) {
					finished <- io.ErrUnexpectedEOF
					return
				}
			}
			finished <- nil
		}()
	}
	for range 2 {
		if err := <-finished; err != nil {
			t.Fatalf("concurrent media probes: %v", err)
		}
	}
	if used, err := CacheSize(cache.directory); err != nil || used > cache.limit {
		t.Fatalf("cache payload %d exceeds %d: %v", used, cache.limit, err)
	}
	if err := cache.Failure(); err != nil {
		t.Fatal(err)
	}
	// Cancel with readers still open and completion notifications possibly queued.
	engine.CancelSession("fixture")
	if used, err := CacheSize(cache.directory); err != nil || used != 0 {
		t.Fatalf("cancelled cache retained %d bytes: %v", used, err)
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if len(cache.windows) != 0 || cache.reserved != 0 || cache.lru.Len() != 0 {
		t.Fatal("cancelled session retained cache ownership")
	}
}
