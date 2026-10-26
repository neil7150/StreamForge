package server

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net"
	"net/http/httptest"
	"testing"
)

type testReader struct {
	*bytes.Reader
	closed bool
}

func (r *testReader) Close() error { r.closed = true; return nil }

type testSource struct{ readers []*testReader }

func (s *testSource) SessionToken(id string) string {
	if id == "session" {
		return "secret"
	}
	return ""
}
func (s *testSource) OpenReader(_ string, _ context.Context) (io.ReadSeekCloser, int64, string, error) {
	r := &testReader{Reader: bytes.NewReader([]byte("0123456789"))}
	s.readers = append(s.readers, r)
	return r, 10, "movie.mp4", nil
}

func (s *testSource) OpenSubtitleReader(_ string, index int, ctx context.Context) (io.ReadSeekCloser, int64, string, error) {
	if index == 9 {
		return nil, 0, "", fmt.Errorf("cancelled: %v", ctx.Err())
	}
	r := &testReader{Reader: bytes.NewReader([]byte("1\n00:00:01,000 --> 00:00:02,000\nHello"))}
	s.readers = append(s.readers, r)
	size := r.Size()
	if index == 8 {
		size = (2 << 20) + 1
	}
	return r, size, "movie.eng.srt", nil
}

func TestSubtitleAuthorizationLimitsAndCleanup(t *testing.T) {
	for _, tc := range []struct {
		path, method string
		status       int
		opened       bool
	}{
		{"/subtitle/session?token=secret&index=1", "GET", 200, true},
		{"/subtitle/session?index=1", "GET", 404, false},
		{"/subtitle/session?token=wrong&index=1", "GET", 404, false},
		{"/subtitle/expired?token=secret&index=1", "GET", 404, false},
		{"/subtitle/session/other?token=secret&index=1", "GET", 404, false},
		{"/subtitle/session?token=secret&index=-1", "GET", 404, false},
		{"/subtitle/session?token=secret&index=garbage", "GET", 404, false},
		{"/subtitle/session?token=secret&index=8", "GET", 413, true},
		{"/subtitle/session?token=secret&index=9", "GET", 404, false},
		{"/subtitle/session?token=secret&index=1", "POST", 405, false},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			source := &testSource{}
			s := NewStreamServer(source, 8888)
			response := httptest.NewRecorder()
			s.server.Handler.ServeHTTP(response, httptest.NewRequest(tc.method, tc.path, nil))
			if response.Code != tc.status {
				t.Fatalf("status %d: %s", response.Code, response.Body.String())
			}
			if (len(source.readers) > 0) != tc.opened {
				t.Fatal("unauthorized request opened a reader")
			}
			for _, reader := range source.readers {
				if !reader.closed {
					t.Fatal("subtitle reader leaked")
				}
			}
			if tc.status == 200 && (response.Header().Get("Cache-Control") != "no-store" || !bytes.Contains(response.Body.Bytes(), []byte("Hello"))) {
				t.Fatal("invalid subtitle response")
			}
		})
	}
}

func TestMediaRangesAndAuthorization(t *testing.T) {
	for _, tc := range []struct {
		name, method, path, byteRange string
		status                        int
		body, contentRange            string
	}{
		{"full", "GET", "/stream/session?token=secret", "", 200, "0123456789", ""},
		{"range", "GET", "/stream/session?token=secret", "bytes=2-4", 206, "234", "bytes 2-4/10"},
		{"tail", "GET", "/stream/session?token=secret", "bytes=-3", 206, "789", "bytes 7-9/10"},
		{"head", "HEAD", "/stream/session?token=secret", "", 200, "", ""},
		{"out of bounds", "GET", "/stream/session?token=secret", "bytes=99-", 416, "", "bytes */10"},
		{"unauthorized", "GET", "/stream/session", "", 404, "", ""},
		{"wrong token", "GET", "/stream/session?token=wrong", "", 404, "", ""},
		{"wrong method", "POST", "/stream/session?token=secret", "", 405, "", ""},
		{"no admin", "POST", "/add", "", 404, "", ""},
		{"invalid path", "GET", "/stream/session/other?token=secret", "", 404, "", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			source := &testSource{}
			server := NewStreamServer(source, 8888)
			req := httptest.NewRequest(tc.method, tc.path, nil)
			if tc.byteRange != "" {
				req.Header.Set("Range", tc.byteRange)
			}
			response := httptest.NewRecorder()
			server.server.Handler.ServeHTTP(response, req)
			if response.Code != tc.status {
				t.Fatalf("status %d", response.Code)
			}
			if tc.status < 400 && response.Body.String() != tc.body {
				t.Fatalf("body %q", response.Body.String())
			}
			if response.Header().Get("Content-Range") != tc.contentRange {
				t.Fatal(response.Header())
			}
			for _, reader := range source.readers {
				if !reader.closed {
					t.Fatal("reader leaked")
				}
			}
			if tc.status == 404 && len(source.readers) != 0 {
				t.Fatal("unauthorized request opened reader")
			}
		})
	}
}

func TestListenReportsOccupiedPort(t *testing.T) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	server := NewStreamServer(&testSource{}, 8888)
	server.server.Addr = listener.Addr().String()
	if err := server.Listen(); err == nil {
		defer server.Stop(context.Background())
		t.Fatal("reported ready on occupied port")
	}
}
