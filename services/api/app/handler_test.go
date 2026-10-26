package app

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestAuthBudgetAndPublicHealth(t *testing.T) {
	handler := guard(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }), Limits{AuthPerMinute: 0.01, AuthBurst: 1})
	for _, test := range []struct {
		path string
		want int
	}{{"/auth/login", 200}, {"/auth/login", 429}, {"/health", 200}} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest("GET", test.path, nil))
		if response.Code != test.want {
			t.Fatalf("%s: got %d, want %d", test.path, response.Code, test.want)
		}
	}
}

func TestPasswordWorkIsBounded(t *testing.T) {
	started := make(chan struct{}, 2)
	release := make(chan struct{})
	handler := guard(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { started <- struct{}{}; <-release }), Limits{})
	var workers sync.WaitGroup
	for range 2 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/auth/login", nil))
		}()
	}
	for range 2 {
		select {
		case <-started:
		case <-time.After(time.Second):
			close(release)
			t.Fatal("password handler did not start")
		}
	}
	for _, request := range []struct{ method, path string }{{"POST", "/auth/register"}, {"GET", "/auth/oauth/google/callback"}} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(request.method, request.path, nil))
		if response.Code != 429 {
			t.Errorf("unbounded password work for %s: %d", request.path, response.Code)
		}
	}
	close(release)
	workers.Wait()
}

func TestBodyReaderIsBounded(t *testing.T) {
	handler := guard(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, err := io.ReadAll(r.Body)
		if len(data) > 4<<20 || err == nil {
			t.Error("oversized body was not bounded")
		}
	}), Limits{})
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/upload", strings.NewReader(strings.Repeat("x", (4<<20)+1))))
}

func TestConfigUsesAssignedPortAndRejectsUnverifiedRemoteConnections(t *testing.T) {
	t.Setenv("AUTH_REDIS_POLICY_MODE", "live")
	t.Setenv("SERVER_PORT", "19123")
	t.Setenv("PORT", "8001")
	t.Setenv("DATABASE_URL", "postgres://u:p@database.example/db?sslmode=verify-full")
	t.Setenv("AUTH_REDIS_URL", "rediss://auth.example:6379/0")
	t.Setenv("CACHE_REDIS_URL", "rediss://cache.example:6379/0")
	t.Setenv("JWT_SECRET", strings.Repeat("a", 64))
	t.Setenv("JWT_ACCESS_TTL", "30m")
	t.Setenv("JWT_REFRESH_TTL", "1h")
	cfg, err := LoadConfig()
	if err != nil || cfg.Port != "19123" {
		t.Fatalf("assigned port: %v", err)
	}
	t.Setenv("DATABASE_URL", "postgres://u:secret@database.example/db?sslmode=disable")
	if _, err := LoadConfig(); err == nil || strings.Contains(err.Error(), "secret") {
		t.Fatal("plaintext remote DB accepted or credentials exposed")
	}
	t.Setenv("DATABASE_URL", "postgres://u:p@database.example/db?sslmode=verify-full")
	t.Setenv("CACHE_REDIS_URL", "rediss://auth.example:6379/1")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("auth/cache logical DBs on one instance accepted")
	}
}

func TestCustomRedisCARequiresTLS(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := OpenRedis(ctx, "redis://127.0.0.1:1", "unread-ca.pem"); err == nil {
		t.Fatal("CA file accepted without TLS")
	}
}
