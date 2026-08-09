// Auth service entry point for StreamForge.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	"streamforge.local/pkg/auth"
	"streamforge.local/pkg/cache"
	"streamforge.local/pkg/database"
	"streamforge.local/pkg/logger"
	"streamforge.local/pkg/middleware"
	"streamforge/services/auth/internal/config"
	"streamforge/services/auth/internal/handler"
	"streamforge/services/auth/internal/repository"
	"streamforge/services/auth/internal/service"
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
		log.Warn().Err(err).Msg("migration warning")
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

	// ── Build dependencies ──────────────────────────────────────────────
	userRepo := repository.NewUserRepository(pool)
	tokenRepo := repository.NewTokenRepository(redisClient)

	jwtCfg := auth.JWTConfig{
		Secret:     cfg.JWTSecret,
		AccessTTL:  cfg.AccessTTL,
		RefreshTTL: cfg.RefreshTTL,
		Issuer:     "streamforge-auth",
	}

	authService := service.NewAuthService(userRepo, tokenRepo, jwtCfg, log)
	authHandler := handler.NewAuthHandler(authService, log)

	// ── Create Fiber app ────────────────────────────────────────────────
	app := fiber.New(fiber.Config{
		AppName:               "StreamForge Auth Service",
		ReadTimeout:           10 * time.Second,
		WriteTimeout:          10 * time.Second,
		IdleTimeout:           120 * time.Second,
		DisableStartupMessage: cfg.IsProd(),
	})

	// Apply standard middleware
	middleware.Setup(app, log)

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":  "ok",
			"service": "auth",
			"time":    time.Now().UTC(),
		})
	})
	app.Get("/metrics", func(c *fiber.Ctx) error {
		c.Type("txt")
		return c.SendString("# HELP streamforge_up Whether the service is running.\n# TYPE streamforge_up gauge\nstreamforge_up{service=\"auth\"} 1\n")
	})

	// Register auth routes
	handler.SetupRoutes(app, authHandler, cfg.JWTSecret, tokenRepo)

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
