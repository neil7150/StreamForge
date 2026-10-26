package backendtests

import (
	"context"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"streamforge.local/pkg/auth"
	authapp "streamforge/services/auth/app"
	contentapp "streamforge/services/content/app"
	searchapp "streamforge/services/search/app"
	userapp "streamforge/services/user/app"
)

// This suite is opt-in. The runner supplies a new loopback-only PostgreSQL
// cluster, never a developer's existing databases or a deployed environment.
func TestLiveBackend(t *testing.T) {
	address := os.Getenv("STREAMFORGE_TEST_POSTGRES_URL")
	if address == "" {
		t.Skip("use npm run validate:backend:integration with a portable PostgreSQL runtime")
	}
	cfg, err := pgxpool.ParseConfig(address)
	if err != nil {
		t.Fatal("invalid integration database configuration")
	}
	if cfg.ConnConfig.Host != "127.0.0.1" {
		t.Fatal("integration tests require loopback PostgreSQL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	admin, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	if err = admin.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	authPool, _ := testDatabase(t, ctx, admin, cfg, filepath.Join(root, "services/auth/db/migrations"))
	userPool, userMigration := testDatabase(t, ctx, admin, cfg, filepath.Join(root, "services/user/db/migrations"))
	contentPool, _ := testDatabase(t, ctx, admin, cfg, filepath.Join(root, "services/content/db/migrations"))
	fixture, err := os.ReadFile(filepath.Join(root, "tests/backend/catalog-fixture.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = contentPool.Exec(ctx, string(fixture)); err != nil {
		t.Fatal(err)
	}

	// Exercise the actual incremental migration in both directions on a fresh DB.
	if err = userMigration.Steps(-1); err != nil {
		t.Fatal(err)
	}
	if err = userMigration.Up(); err != nil {
		t.Fatal(err)
	}
	version, dirty, err := userMigration.Version()
	if err != nil || version != 2 || dirty {
		t.Fatalf("unexpected migration state: %d dirty=%v error=%v", version, dirty, err)
	}
	if _, err = userPool.Exec(ctx, `ALTER TABLE watchlist_items ADD CONSTRAINT integration_insert_failure CHECK (content_key <> 'force-insert-failure')`); err != nil {
		t.Fatal(err)
	}

	// Redis is a test-only TCP-compatible server, not a production Redis result.
	mini := miniredis.RunT(t)
	redisClient := redis.NewClient(&redis.Options{Addr: mini.Addr()})
	defer redisClient.Close()
	secret := uuid.NewString() + uuid.NewString()
	a := authapp.New(authPool, redisClient, authapp.Config{JWTSecret: secret, AccessTTL: 2 * time.Second, RefreshTTL: time.Hour, AppEnv: "test"}, zerolog.Nop())
	u := userapp.New(userPool, secret, auth.NewRedisTokenBlacklist(redisClient), zerolog.Nop())
	c := contentapp.New(contentPool, redisClient, secret, auth.NewRedisTokenBlacklist(redisClient), zerolog.Nop())
	s := searchapp.New(contentPool, redisClient, zerolog.Nop())
	authHTTP, userHTTP := adaptor.FiberApp(a), adaptor.FiberApp(u)
	contentHTTP, searchHTTP := adaptor.FiberApp(c), adaptor.FiberApp(s)
	gateway := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Failure injection belongs only to this temporary test gateway.
		if r.URL.Path == "/__integration__/redis" && r.Method == http.MethodPost {
			setRedisFault(mini, r.URL.Query().Get("mode"))
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{ "data": {} }`)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/v1/search") {
			searchHTTP.ServeHTTP(w, r)
		} else if strings.HasPrefix(r.URL.Path, "/api/v1/movies") || strings.HasPrefix(r.URL.Path, "/api/v1/shows") || strings.HasPrefix(r.URL.Path, "/api/v1/genres") || strings.HasPrefix(r.URL.Path, "/api/v1/episodes") || strings.HasPrefix(r.URL.Path, "/api/v1/admin") {
			contentHTTP.ServeHTTP(w, r)
		} else if strings.HasPrefix(r.URL.Path, "/auth/") {
			authHTTP.ServeHTTP(w, r)
		} else {
			userHTTP.ServeHTTP(w, r)
		}
	}))
	defer gateway.Close()
	runClientChecks(t, ctx, root, gateway, secret)
}

func runClientChecks(t *testing.T, ctx context.Context, root string, gateway *httptest.Server, secret string) {
	t.Helper()
	var err error
	caFile := filepath.Join(t.TempDir(), "backend-test-ca.pem")
	if err = os.WriteFile(caFile, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: gateway.Certificate().Raw}), 0600); err != nil {
		t.Fatal(err)
	}
	node := os.Getenv("STREAMFORGE_TEST_NODE")
	if node == "" {
		node = "node"
	}
	command := exec.CommandContext(ctx, node, "--import", "./scripts/register-typescript.mjs", "./scripts/backend-client-check.mjs")
	command.Dir = root
	command.Env = append(os.Environ(), "STREAMFORGE_TEST_API_URL="+gateway.URL, "NODE_EXTRA_CA_CERTS="+caFile, "NODE_TLS_REJECT_UNAUTHORIZED=1", "HTTP_PROXY=", "HTTPS_PROXY=", "ALL_PROXY=")
	adminToken, err := auth.GenerateAccessToken(auth.JWTConfig{Secret: secret, AccessTTL: time.Minute, Issuer: "streamforge-auth"}, uuid.New(), "catalog-admin@example.com", "admin")
	if err != nil {
		t.Fatal(err)
	}
	command.Env = append(command.Env, "STREAMFORGE_TEST_ADMIN_TOKEN="+adminToken)
	output, err := command.CombinedOutput()
	t.Log(strings.TrimSpace(string(output)))
	if err != nil {
		t.Fatalf("HTTPS client checks failed: %v", err)
	}
}

func testDatabase(t *testing.T, ctx context.Context, admin *pgxpool.Pool, base *pgxpool.Config, migrationDir string) (*pgxpool.Pool, *migrate.Migrate) {
	t.Helper()
	name := "streamforge_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{name}.Sanitize()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, err := admin.Exec(cleanup, "DROP DATABASE "+pgx.Identifier{name}.Sanitize()+" WITH (FORCE)"); err != nil {
			t.Errorf("clean up owned test database: %v", err)
		}
	})
	cfg := base.Copy()
	cfg.ConnConfig.Database = name
	cfg.MaxConns = 8
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if migrationDir == "" {
		return pool, nil
	}
	// A file URL retains drive letters and spaces on Windows.
	directory := filepath.ToSlash(migrationDir)
	databaseURL, err := url.Parse(base.ConnConfig.ConnString())
	if err != nil {
		t.Fatal(err)
	}
	databaseURL.Path = "/" + name
	m, err := migrate.New("file://"+directory, databaseURL.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		sourceErr, dbErr := m.Close()
		if sourceErr != nil || dbErr != nil {
			t.Errorf("close migrations: %v %v", sourceErr, dbErr)
		}
	})
	if err = m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		t.Fatal(err)
	}
	return pool, m
}
