package app

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5/pgxpool"
	authdb "streamforge/services/auth/db/migrations"
	contentdb "streamforge/services/content/db/migrations"
	userdb "streamforge/services/user/db/migrations"
)

// One managed database, with isolated schemas and migration histories. Search
// reuses the content pool; three small pools replace four independent services.
type Stores struct{ Auth, Content, User *pgxpool.Pool }

func (s *Stores) Close() {
	for _, pool := range []*pgxpool.Pool{s.Auth, s.Content, s.User} {
		if pool != nil {
			pool.Close()
		}
	}
}

func OpenStores(ctx context.Context, address string) (*Stores, error) {
	parsed, err := url.Parse(address)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") {
		return nil, errors.New("DATABASE_URL must be a PostgreSQL URI")
	}
	base, err := pgxpool.ParseConfig(address)
	if err != nil {
		return nil, errors.New("invalid DATABASE_URL")
	}
	base.MaxConns, base.MinConns = 2, 0
	base.ConnConfig.ConnectTimeout = 5 * time.Second
	root, err := pgxpool.NewWithConfig(ctx, base)
	if err != nil {
		return nil, errors.New("database configuration failed")
	}
	defer root.Close()
	if err = root.Ping(ctx); err != nil {
		return nil, fmt.Errorf("database connection failed: %w", err)
	}
	// Install shared extension functions in public before schema-local migrations.
	// Requires CREATE in this account's managed database, never superuser access
	// to other databases or tenants.
	for _, statement := range []string{
		`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`,
		`CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA public`,
	} {
		if _, err = root.Exec(ctx, statement); err != nil {
			return nil, fmt.Errorf("required database extension unavailable: %w", err)
		}
	}
	stores := &Stores{}
	success := false
	defer func() {
		if !success {
			stores.Close()
		}
	}()
	for _, part := range []struct {
		name   string
		files  fs.FS
		target **pgxpool.Pool
	}{
		{"streamforge_auth", authdb.Files, &stores.Auth},
		{"streamforge_content", contentdb.Files, &stores.Content},
		{"streamforge_user", userdb.Files, &stores.User},
	} {
		if _, err = root.Exec(ctx, `CREATE SCHEMA IF NOT EXISTS `+part.name); err != nil {
			return nil, fmt.Errorf("create application schema: %w", err)
		}
		schemaURL := *parsed
		query := schemaURL.Query()
		query.Set("search_path", part.name+",public")
		query.Set("connect_timeout", "5")
		query.Set("statement_timeout", "10000")
		schemaURL.RawQuery = query.Encode()
		source, e := iofs.New(part.files, ".")
		if e != nil {
			return nil, e
		}
		migration, e := migrate.NewWithSourceInstance("iofs", source, schemaURL.String())
		if e != nil {
			source.Close()
			return nil, fmt.Errorf("initialize %s migrations: %w", part.name, e)
		}
		e = migration.Up()
		sourceErr, databaseErr := migration.Close()
		if e != nil && !errors.Is(e, migrate.ErrNoChange) {
			return nil, fmt.Errorf("apply %s migrations: %w", part.name, e)
		}
		if sourceErr != nil {
			return nil, sourceErr
		}
		if databaseErr != nil {
			return nil, databaseErr
		}
		poolConfig := base.Copy()
		poolConfig.MaxConns, poolConfig.MinConns = 4, 1
		poolConfig.MaxConnIdleTime = 5 * time.Minute
		poolConfig.ConnConfig.RuntimeParams["search_path"] = part.name + ",public"
		poolConfig.ConnConfig.RuntimeParams["statement_timeout"] = "10000"
		pool, e := pgxpool.NewWithConfig(ctx, poolConfig)
		if e != nil {
			return nil, fmt.Errorf("create %s pool: %w", part.name, e)
		}
		*part.target = pool
		if e = pool.Ping(ctx); e != nil {
			return nil, fmt.Errorf("connect %s pool: %w", part.name, e)
		}
	}
	success = true
	return stores, nil
}
