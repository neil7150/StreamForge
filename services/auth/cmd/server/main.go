// Auth service entry point for StreamForge.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	"streamforge.local/pkg/cache"
	"streamforge.local/pkg/database"
	"streamforge.local/pkg/logger"
	authapp "streamforge/services/auth/app"
	"streamforge/services/auth/internal/config"
)

func main() {
	// ── Load configuration ──────────────────────────────────────────────
	cfg := config.Load()
	log := logger.New(cfg.LogLevel, cfg.AppEnv)
	log.Info().
		Str("port", cfg.Port).
		Str("env", cfg.AppEnv).
		Msg("starting auth service")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// ── Connect to PostgreSQL ───────────────────────────────────────────
	dbCfg := database.DefaultConfig(cfg.DatabaseURL)
	pool, err := database.Connect(ctx, dbCfg)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to PostgreSQL")
	}
	defer pool.Close()
	log.Info().Msg("connected to PostgreSQL")

	// ── Run database migrations ─────────────────────────────────────────
	if err := runMigrations(cfg.DatabaseURL); err != nil {
		log.Fatal().Err(err).Msg("database migration failed")
	} else {
		log.Info().Msg("database migrations applied")
	}

	// ── Connect to Redis ────────────────────────────────────────────────
	redisClient, err := cache.Connect(ctx, cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to Redis")
	}
	defer redisClient.Close()
	log.Info().Msg("connected to Redis")

	app := authapp.New(pool, redisClient, cfg, log)

	// ── Graceful shutdown ───────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	go func() {
		addr := fmt.Sprintf(":%s", cfg.Port)
		log.Info().Str("addr", addr).Msg("listening")
		if err := app.Listen(addr); err != nil {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	<-quit
	log.Info().Msg("shutting down auth service...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("server shutdown error")
	}

	log.Info().Msg("auth service stopped")
}

// runMigrations applies database migrations from the db/migrations directory.
func runMigrations(databaseURL string) error {
	m, err := migrate.New("file://db/migrations", databaseURL)
	if err != nil {
		return fmt.Errorf("create migration instance: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("apply migrations: %w", err)
	}
	return nil
}
