package backendtests

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	compact "streamforge/services/api/app"
	authapp "streamforge/services/auth/app"
)

func TestCompactBackend(t *testing.T) {
	address := os.Getenv("STREAMFORGE_TEST_POSTGRES_URL")
	if address == "" {
		t.Skip("use npm run validate:backend:integration")
	}
	base, err := pgxpool.ParseConfig(address)
	if err != nil {
		t.Fatal("invalid test database URL")
	}
	if base.ConnConfig.Host != "127.0.0.1" {
		t.Fatal("test database must be loopback")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	admin, err := pgxpool.NewWithConfig(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	role := "compact_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	password := uuid.NewString() // UUID alphabet contains no SQL quote characters.
	identifier := pgx.Identifier{role}.Sanitize()
	if _, err = admin.Exec(ctx, fmt.Sprintf("CREATE ROLE %s LOGIN PASSWORD '%s'", identifier, password)); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(context.Background(), "DROP ROLE "+identifier); err != nil {
			t.Error(err)
		}
	})
	raw, _ := testDatabase(t, ctx, admin, base, "")
	database := raw.Config().ConnConfig.Database
	if _, err = admin.Exec(ctx, "GRANT CREATE ON DATABASE "+pgx.Identifier{database}.Sanitize()+" TO "+identifier); err != nil {
		t.Fatal(err)
	}
	if _, err = raw.Exec(ctx, "GRANT USAGE,CREATE ON SCHEMA public TO "+identifier); err != nil {
		t.Fatal(err)
	}
	parsed, _ := url.Parse(address)
	parsed.Path = "/" + database
	parsed.User = url.UserPassword(role, password)
	stores, err := compact.OpenStores(ctx, parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	// A second startup must see the same independently versioned migrations.
	stores.Close()
	stores, err = compact.OpenStores(ctx, parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(stores.Close)
	for _, part := range []struct {
		pool    *pgxpool.Pool
		schema  string
		version int
	}{{stores.Auth, "streamforge_auth", 1}, {stores.Content, "streamforge_content", 1}, {stores.User, "streamforge_user", 2}} {
		var schema string
		var version int
		var dirty bool
		if err := part.pool.QueryRow(ctx, "SELECT current_schema()").Scan(&schema); err != nil || schema != part.schema {
			t.Fatalf("schema routing: %s %v", schema, err)
		}
		if err := part.pool.QueryRow(ctx, "SELECT version,dirty FROM schema_migrations").Scan(&version, &dirty); err != nil || version != part.version || dirty {
			t.Fatalf("migration isolation %s: version=%d dirty=%v error=%v", schema, version, dirty, err)
		}
	}
	root, _ := filepath.Abs("../..")
	fixture, err := os.ReadFile(filepath.Join(root, "tests/backend/catalog-fixture.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = stores.Content.Exec(ctx, string(fixture)); err != nil {
		t.Fatal(err)
	}
	if _, err = stores.User.Exec(ctx, `ALTER TABLE watchlist_items ADD CONSTRAINT integration_insert_failure CHECK (content_key <> 'force-insert-failure')`); err != nil {
		t.Fatal(err)
	}
	authMini, cacheMini := miniredis.RunT(t), miniredis.RunT(t)
	authRedis := redis.NewClient(&redis.Options{Addr: authMini.Addr()})
	defer authRedis.Close()
	cacheRedis := redis.NewClient(&redis.Options{Addr: cacheMini.Addr()})
	defer cacheRedis.Close()
	secret := uuid.NewString() + uuid.NewString()
	handler := compact.NewHandler(stores, authRedis, cacheRedis, authapp.Config{JWTSecret: secret, AccessTTL: 2 * time.Second, RefreshTTL: time.Hour, AppEnv: "test"}, zerolog.Nop(), compact.Limits{AuthPerMinute: 60000, AuthBurst: 1000})
	gateway := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/__integration__/redis" && r.Method == http.MethodPost {
			setRedisFault(authMini, r.URL.Query().Get("mode"))
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"data":{}}`)
			return
		}
		handler.ServeHTTP(w, r)
	}))
	defer gateway.Close()
	runClientChecks(t, ctx, root, gateway, secret)
	t.Log("PASS compact routing, non-superuser schema migrations, repeat startup and the complete shared-client regressions")
}
