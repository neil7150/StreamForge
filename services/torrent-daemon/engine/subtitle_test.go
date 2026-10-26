package engine

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
)

func TestBundledSubtitleReadsVerifiedBytesAndCancels(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "movie.eng.srt")
	want := []byte("1\n00:00:01,000 --> 00:00:03,000\nHello\n")
	if err := os.WriteFile(path, want, 0600); err != nil {
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
	seedConfig := localPeerConfig(root)
	seedConfig.Seed = true
	seedFile, err := os.Open(path)
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
	cache := newBoundedCache(t.TempDir(), 2<<20)
	config := localPeerConfig(cache.directory)
	config.DefaultStorage = cache
	client, err := torrent.NewClient(config)
	if err != nil {
		t.Fatal(err)
	}
	e := &TorrentEngine{client: client, cache: cache, dataDir: cache.directory, sessions: make(map[string]*streamSession)}
	defer e.Close()
	tor, err := client.AddTorrent(meta)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	e.sessions["subtitle"] = &streamSession{ctx: ctx, cancel: cancel, torrent: tor, started: time.Now(), readers: make(map[*sessionReader]struct{}), info: SessionInfo{Ready: true, SelectedFileIndex: 0}}
	cache.onFailure = cancel
	tor.AddClientPeer(seeder)
	for _, index := range []int{-1, 1, 100} {
		if reader, _, _, err := e.OpenSubtitleReader("subtitle", index, ctx); err == nil {
			reader.Close()
			t.Fatalf("accepted invalid index %d", index)
		}
	}
	if reader, _, _, err := e.OpenSubtitleReader("old-session", 0, ctx); err == nil {
		reader.Close()
		t.Fatal("accepted stale session")
	}
	reader, size, _, err := e.OpenSubtitleReader("subtitle", 0, ctx)
	if err != nil {
		t.Fatal(err)
	}
	got, err := io.ReadAll(reader)
	reader.Close()
	if err != nil || size != int64(len(want)) || !bytes.Equal(got, want) {
		t.Fatalf("subtitle mismatch %q, %v", got, err)
	}
	request, stop := context.WithCancel(ctx)
	reader, _, _, err = e.OpenSubtitleReader("subtitle", 0, request)
	if err != nil {
		t.Fatal(err)
	}
	stop()
	if _, err := reader.Read(make([]byte, 1)); err == nil {
		t.Fatal("read survived request cancellation")
	}
	reader.Close()
	e.CancelSession("subtitle")
	if reader, _, _, err := e.OpenSubtitleReader("subtitle", 0, ctx); err == nil {
		reader.Close()
		t.Fatal("read survived session cancellation")
	}
}
