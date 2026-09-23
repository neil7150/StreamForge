package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	pkgauth "streamforge.local/pkg/auth"
	"streamforge.local/pkg/cache"
	"streamforge.local/pkg/database"
	"streamforge.local/pkg/logger"
	pkgmw "streamforge.local/pkg/middleware"

	"streamforge/services/content/internal/config"
	"streamforge/services/content/internal/handler"
	"streamforge/services/content/internal/repository"
	"streamforge/services/content/internal/service"
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
		log.Warn().Err(err).Msg("Migration warning (may already be applied)")
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

	// ── Initialize layers ─────────────────────────────────
	movieRepo := repository.NewMovieRepository(pool)
	genreRepo := repository.NewGenreRepository(pool)
	magnetRepo := repository.NewMagnetRepository(pool)
	subtitleRepo := repository.NewSubtitleRepository(pool)

	contentSvc := service.NewContentService(movieRepo, magnetRepo, subtitleRepo, rdb, log)
	genreSvc := service.NewGenreService(genreRepo, movieRepo, rdb, log)

	movieHandler := handler.NewMovieHandler(contentSvc, log)
	genreHandler := handler.NewGenreHandler(genreSvc, log)
	showRepo := repository.NewShowRepository(pool)
	showSvc := service.NewShowService(showRepo, genreRepo, magnetRepo, subtitleRepo, rdb, log)
	showHandler := handler.NewShowHandler(showSvc, log)

	// ── Create Fiber app ──────────────────────────────────
	app := fiber.New(fiber.Config{
		AppName:      "StreamForge Content Service",
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			message := "Internal server error"
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
				message = e.Message
			}
			return c.Status(code).JSON(fiber.Map{
				"success": false,
				"error":   fiber.Map{"code": "INTERNAL_ERROR", "message": message},
			})
		},
	})

	pkgmw.Setup(app, log)
	pkgmw.RegisterMetrics(app, "content")

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "service": "content"})
	})

	// Register routes
	handler.SetupRoutes(app, movieHandler, genreHandler, showHandler, cfg.JWTSecret, tokenBlacklist)

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
