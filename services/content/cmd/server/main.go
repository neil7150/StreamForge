package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"streamforge/pkg/cache"
	"streamforge/pkg/database"
	"streamforge/pkg/logger"
	pkgmw "streamforge/pkg/middleware"

	"streamforge/services/content/internal/config"
	"streamforge/services/content/internal/handler"
	"streamforge/services/content/internal/repository"
	"streamforge/services/content/internal/service"
)

func main() {
	cfg := config.Load()
	log := logger.New(cfg.LogLevel, cfg.Env)

	log.Info().Str("port", cfg.Port).Str("env", cfg.Env).Msg("Starting Content Service")

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
	if err := runMigrations(pool); err != nil {
		log.Warn().Err(err).Msg("Migration warning (may already be applied)")
	}

	// ── Connect to Redis ──────────────────────────────────
	rdb, err := cache.Connect(ctx, cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to Redis")
	}
	defer rdb.Close()
	log.Info().Msg("Connected to Redis")

	// ── Initialize layers ─────────────────────────────────
	movieRepo := repository.NewMovieRepository(pool)
	genreRepo := repository.NewGenreRepository(pool)
	magnetRepo := repository.NewMagnetRepository(pool)
	subtitleRepo := repository.NewSubtitleRepository(pool)

	contentSvc := service.NewContentService(movieRepo, magnetRepo, subtitleRepo, rdb, log)
	genreSvc := service.NewGenreService(genreRepo, movieRepo, rdb, log)

	movieHandler := handler.NewMovieHandler(contentSvc, log)
	genreHandler := handler.NewGenreHandler(genreSvc, log)

	// ── Create Fiber app ──────────────────────────────────
	app := fiber.New(fiber.Config{
		AppName:      "StreamForge Content Service",
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{
				"success": false,
				"error":   fiber.Map{"code": "INTERNAL_ERROR", "message": err.Error()},
			})
		},
	})

	pkgmw.Setup(app, log)

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "service": "content"})
	})

	// Register routes
	handler.SetupRoutes(app, movieHandler, genreHandler, cfg.JWTSecret)

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

func runMigrations(pool *pgxpool.Pool) error {
	ctx := context.Background()
	migrationSQL, err := os.ReadFile("db/migrations/001_create_content.up.sql")
	if err != nil {
		// Try alternative path (Docker)
		migrationSQL, err = os.ReadFile("/app/migrations/001_create_content.up.sql")
		if err != nil {
			return fmt.Errorf("read migration file: %w", err)
		}
	}
	_, err = pool.Exec(ctx, string(migrationSQL))
	return err
}
