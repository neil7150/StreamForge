package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	pkgauth "streamforge.local/pkg/auth"
	"streamforge.local/pkg/cache"
	"streamforge.local/pkg/database"
	"streamforge.local/pkg/logger"
	contentapp "streamforge/services/content/app"

	"streamforge/services/content/internal/config"
)

func main() {
	cfg := config.Load()
	log := logger.New(cfg.LogLevel, cfg.AppEnv)

	log.Info().Str("port", cfg.Port).Str("env", cfg.AppEnv).Msg("Starting Content Service")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// ── Connect to PostgreSQL ─────────────────────────────
	pool, err := database.Connect(ctx, database.DefaultConfig(cfg.DatabaseURL))
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to PostgreSQL")
	}
	defer pool.Close()
	log.Info().Msg("Connected to PostgreSQL")

	// ── Run migrations ────────────────────────────────────
	if err := runMigrations(cfg.DatabaseURL); err != nil {
		log.Fatal().Err(err).Msg("Database migration failed")
	}

	// ── Connect to Redis ──────────────────────────────────
	rdb, err := cache.Connect(ctx, cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to Redis")
	}
	defer rdb.Close()
	log.Info().Msg("Connected to Redis")

	authRDB, err := cache.Connect(ctx, cfg.AuthRedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to auth Redis")
	}
	defer authRDB.Close()
	tokenBlacklist := pkgauth.NewRedisTokenBlacklist(authRDB)

	app := contentapp.New(pool, rdb, cfg.JWTSecret, tokenBlacklist, log)

	// ── Start server ──────────────────────────────────────
	go func() {
		if err := app.Listen(":" + cfg.Port); err != nil {
			log.Fatal().Err(err).Msg("Server failed")
		}
	}()

	log.Info().Str("port", cfg.Port).Msg("Content Service started")

	// ── Graceful shutdown ─────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down Content Service...")
	if err := app.ShutdownWithTimeout(5 * time.Second); err != nil {
		log.Error().Err(err).Msg("Shutdown error")
	}
}

func runMigrations(databaseURL string) error {
	m, err := migrate.New("file://db/migrations", databaseURL)
	if err != nil {
		return err
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return err
	}
	return nil
}
