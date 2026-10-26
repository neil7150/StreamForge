package engine

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
)

// Unlike file-read fixtures, start from a magnet without metadata, then inject
// a local peer. This exercises the same BEP 9 wait used by Android preparation.
func TestMagnetMetadataProgressBeforePreparationCompletes(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "fixture.mp4")
	if err := os.WriteFile(path, make([]byte, 32<<10), 0600); err != nil {
		t.Fatal(err)
	}
	info := metainfo.Info{PieceLength: 16 << 10}
	if err := info.BuildFromFilePath(path); err != nil {
		t.Fatal(err)
	}
	encoded, err := bencode.Marshal(info)
	if err != nil {
		t.Fatal(err)
	}
	meta := &metainfo.MetaInfo{InfoBytes: encoded}
	seedFile, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer seedFile.Close()
	seedCfg := localPeerConfig(root)
	seedCfg.Seed = true
	seedCfg.DefaultStorage = fixtureStorage{seedFile}
	seed, err := torrent.NewClient(seedCfg)
	if err != nil {
		t.Fatal(err)
	}
	defer seed.Close()
	if _, err := seed.AddTorrent(meta); err != nil {
		t.Fatal(err)
	}
	cache := newBoundedCache(t.TempDir(), 4<<20)
	cfg := localPeerConfig(cache.directory)
	cfg.DefaultStorage = cache
	client, err := torrent.NewClient(cfg)
	if err != nil {
		t.Fatal(err)
	}
	e := &TorrentEngine{client: client, cache: cache, dataDir: cache.directory, sessions: make(map[string]*streamSession)}
	defer e.Close()
	result := make(chan error, 1)
	go func() {
		prepared, err := e.PrepareSession("magnet", "magnet:?xt=urn:btih:"+meta.HashInfoBytes().HexString(), -1, 0, 0)
		if err == nil && (!prepared.Ready || len(prepared.Files) != 1) {
			err = context.Canceled
		}
		result <- err
	}()
	deadline := time.Now().Add(5 * time.Second)
	var active *streamSession
	for time.Now().Before(deadline) {
		e.mu.Lock()
		active = e.sessions["magnet"]
		e.mu.Unlock()
		if active != nil {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if active == nil {
		t.Fatal("native session not registered while discovering")
	}
	stats, err := e.GetStats("magnet")
	if err != nil || stats.MetadataReady || stats.TotalSize != 0 {
		t.Fatalf("pre-metadata stats: %+v, %v", stats, err)
	}
	active.torrent.AddClientPeer(seed)
	select {
	case err := <-result:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("local peer did not supply magnet metadata")
	}
	stats, err = e.GetStats("magnet")
	if err != nil || !stats.MetadataReady || stats.TotalSize != 32<<10 {
		t.Fatalf("ready stats: %+v, %v", stats, err)
	}
	e.CancelSession("magnet")
	if _, err := e.GetStats("magnet"); err == nil {
		t.Fatal("cancelled preparation retained statistics")
	}
}
