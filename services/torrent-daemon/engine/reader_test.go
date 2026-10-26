package engine

import (
	"context"
	"errors"
	"io"
	"sync/atomic"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
)

type blockingReader struct {
	started chan struct{}
	closed  atomic.Int32
}

func (r *blockingReader) Read([]byte) (int, error) { return 0, io.EOF }
func (r *blockingReader) ReadContext(ctx context.Context, _ []byte) (int, error) {
	close(r.started)
	<-ctx.Done()
	return 0, ctx.Err()
}
func (r *blockingReader) Seek(offset int64, _ int) (int64, error) { return offset, nil }
func (r *blockingReader) Close() error                            { r.closed.Add(1); return nil }
func (r *blockingReader) SetReadahead(int64)                      {}
func (r *blockingReader) SetReadaheadFunc(torrent.ReadaheadFunc)  {}
func (r *blockingReader) SetContext(context.Context)              {}
func (r *blockingReader) SetResponsive()                          {}

func TestCloseCancelsBlockedReadAndReleasesExactlyOnce(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	raw := &blockingReader{started: make(chan struct{})}
	var released atomic.Int32
	reader := &sessionReader{Reader: raw, ctx: ctx, cancel: cancel, stop: func() bool { return true }, release: func() { released.Add(1) }}
	finished := make(chan error, 1)
	go func() { _, err := reader.Read(make([]byte, 1)); finished <- err }()
	<-raw.started
	if err := reader.Close(); err != nil {
		t.Fatal(err)
	}
	reader.Close()
	select {
	case err := <-finished:
		if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("blocked read was not cancelled")
	}
	if raw.closed.Load() != 1 || released.Load() != 1 {
		t.Fatal("duplicate or missing close/release")
	}
}
