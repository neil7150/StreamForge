package app

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"streamforge.local/pkg/auth"
	authapp "streamforge/services/auth/app"
	contentapp "streamforge/services/content/app"
	searchapp "streamforge/services/search/app"
	userapp "streamforge/services/user/app"
)

type Limits struct {
	AuthPerMinute float64
	AuthBurst     int
}

var DefaultLimits = Limits{AuthPerMinute: 30, AuthBurst: 8}

// Reuses all existing service constructors and route contracts in one process.
// TLS terminates at the hosting provider. This handler owns no public proxy,
// media streaming, subprocesses or torrent engine.
func NewHandler(stores *Stores, authRedis, cacheRedis *redis.Client, cfg authapp.Config, log zerolog.Logger, limits Limits) http.Handler {
	blacklist := auth.NewRedisTokenBlacklist(authRedis)
	authHTTP := adaptor.FiberApp(authapp.New(stores.Auth, authRedis, cfg, log))
	contentHTTP := adaptor.FiberApp(contentapp.New(stores.Content, cacheRedis, cfg.JWTSecret, blacklist, log))
	userHTTP := adaptor.FiberApp(userapp.New(stores.User, cfg.JWTSecret, blacklist, log))
	searchHTTP := adaptor.FiberApp(searchapp.New(stores.Content, cacheRedis, log))
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/health":
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "streamforge-api"})
		case strings.HasPrefix(r.URL.Path, "/auth/"):
			authHTTP.ServeHTTP(w, r)
		case routePrefix(r.URL.Path, "/api/v1/search"):
			searchHTTP.ServeHTTP(w, r)
		case routePrefix(r.URL.Path, "/api/v1/profile") || routePrefix(r.URL.Path, "/api/v1/sync"):
			userHTTP.ServeHTTP(w, r)
		case routePrefix(r.URL.Path, "/api/v1/movies") || routePrefix(r.URL.Path, "/api/v1/shows") || routePrefix(r.URL.Path, "/api/v1/episodes") || routePrefix(r.URL.Path, "/api/v1/genres") || routePrefix(r.URL.Path, "/api/v1/content") || routePrefix(r.URL.Path, "/api/v1/admin"):
			contentHTTP.ServeHTTP(w, r)
		default:
			http.NotFound(w, r)
		}
	})
	return guard(handler, limits)
}

func routePrefix(path, prefix string) bool {
	return path == prefix || strings.HasPrefix(path, prefix+"/")
}

// Bound global concurrency and password hashing. A conservative global auth
// budget avoids trusting spoofable forwarded-IP headers before provider proxy
// behavior is verified. It is a staging traffic budget, not per-user fairness.
func guard(next http.Handler, limits Limits) http.Handler {
	requests, hashes := make(chan struct{}, 16), make(chan struct{}, 2)
	var mu sync.Mutex
	tokens, last := float64(limits.AuthBurst), time.Now()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reject := func(message string) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "2")
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(map[string]any{"success": false, "error": map[string]string{"code": "RATE_LIMITED", "message": message}})
		}
		select {
		case requests <- struct{}{}:
			defer func() { <-requests }()
		default:
			reject("Server busy; retry shortly")
			return
		}
		if r.Method != http.MethodOptions && strings.HasPrefix(r.URL.Path, "/auth/") && limits.AuthPerMinute > 0 {
			mu.Lock()
			now := time.Now()
			tokens = min(float64(limits.AuthBurst), tokens+now.Sub(last).Minutes()*limits.AuthPerMinute)
			last = now
			allowed := tokens >= 1
			if allowed {
				tokens--
			}
			mu.Unlock()
			if !allowed {
				reject("Authentication request budget reached; retry later")
				return
			}
		}
		passwordWork := r.Method == http.MethodPost && (r.URL.Path == "/auth/login" || r.URL.Path == "/auth/register")
		// First-time OAuth sign-in also hashes a generated password.
		if passwordWork || strings.HasPrefix(r.URL.Path, "/auth/oauth/") {
			select {
			case hashes <- struct{}{}:
				defer func() { <-hashes }()
			default:
				reject("Sign-in busy; retry shortly")
				return
			}
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4<<20)
		next.ServeHTTP(w, r)
	})
}
