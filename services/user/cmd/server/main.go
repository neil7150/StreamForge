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

	"streamforge/services/user/internal/config"
	"streamforge/services/user/internal/handler"
	"streamforge/services/user/internal/repository"
	"streamforge/services/user/internal/service"
	"streamforge.local/pkg/auth"
	"streamforge.local/pkg/database"
	"streamforge.local/pkg/logger"
	"streamforge.local/pkg/middleware"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

func main() {
	logger.InitLogger("development")
	cfg := config.Load()

	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer db.Close()

	// Run migrations
	if err := runMigrations(cfg.DatabaseURL); err != nil {
		log.Warn().Err(err).Msg("migration warning")
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

	profileRepo := repository.NewProfileRepository(db)
	syncRepo := repository.NewSyncRepository(db)

	profileSvc := service.NewProfileService(profileRepo)
	syncSvc := service.NewSyncService(syncRepo)

	profileH := handler.NewProfileHandler(profileSvc)
	syncH := handler.NewSyncHandler(syncSvc)

	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
	})

	app.Use(middleware.RequestLogger())
	app.Use(middleware.Recover())
	middleware.RegisterMetrics(app, "user")

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.SendString("OK")
	})

	handler.SetupRoutes(app, profileH, syncH, cfg.JWTSecret, tokenBlacklist)

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
	
	_ = ctx
	
	if err := app.Shutdown(); err != nil {
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

