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

	"streamforge.local/pkg/auth"
	"streamforge.local/pkg/database"
	"streamforge.local/pkg/logger"
	userapp "streamforge/services/user/app"
	"streamforge/services/user/internal/config"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

func main() {
	cfg := config.Load()
	log.Logger = logger.New(cfg.LogLevel, cfg.AppEnv)

	db, err := database.Connect(context.Background(), database.DefaultConfig(cfg.DatabaseURL))
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer db.Close()

	// Run migrations
	if err := runMigrations(cfg.DatabaseURL); err != nil {
		log.Fatal().Err(err).Msg("database migration failed")
	} else {
		log.Info().Msg("database migrations applied")
	}

	authRedisOpts, err := redis.ParseURL(cfg.AuthRedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to parse auth redis url")
	}
	authRedis := redis.NewClient(authRedisOpts)
	defer authRedis.Close()

	tokenBlacklist := auth.NewRedisTokenBlacklist(authRedis)

	app := userapp.New(db, cfg.JWTSecret, tokenBlacklist, log.Logger)

	go func() {
		if err := app.Listen(":" + cfg.Port); err != nil {
			log.Fatal().Err(err).Msg("Failed to start server")
		}
	}()

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c

	log.Info().Msg("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := app.ShutdownWithContext(ctx); err != nil {
		log.Error().Err(err).Msg("Server shutdown error")
	}
	log.Info().Msg("Server stopped")
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
