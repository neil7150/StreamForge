package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"streamforge.local/pkg/middleware"
	"streamforge/services/search/internal/config"
	"streamforge/services/search/internal/handler"
	"streamforge/services/search/internal/service"
)

func main() {
	cfg := config.Load()

	// Logger
	logLevel, err := zerolog.ParseLevel(cfg.LogLevel)
	if err != nil {
		logLevel = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(logLevel)
	log := zerolog.New(os.Stdout).With().Timestamp().Logger()
	if cfg.AppEnv == "development" {
		log = log.Output(zerolog.ConsoleWriter{Out: os.Stdout})
	}

	// Database
	dbConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Unable to parse database URL")
	}
	dbPool, err := pgxpool.NewWithConfig(context.Background(), dbConfig)
	if err != nil {
		log.Fatal().Err(err).Msg("Unable to connect to database")
	}
	defer dbPool.Close()

	// Redis
	rdbOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Unable to parse Redis URL")
	}
	rdb := redis.NewClient(rdbOpts)
	defer rdb.Close()

	// Dependencies
	searchService := service.NewSearchService(dbPool, rdb, log)
	searchHandler := handler.NewSearchHandler(searchService, log)

	// Fiber App
	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	middleware.RegisterMetrics(app, "search")

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.SendString("OK")
	})

	handler.SetupRoutes(app, searchHandler)

	// Graceful shutdown
	go func() {
		addr := fmt.Sprintf(":%s", cfg.Port)
		log.Info().Str("port", cfg.Port).Msg("Starting search service")
		if err := app.Listen(addr); err != nil {
			log.Fatal().Err(err).Msg("Server failed")
		}
	}()

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c

	log.Info().Msg("Shutting down gracefully, press Ctrl+C again to force")
	_, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	
	if err := app.Shutdown(); err != nil {
		log.Error().Err(err).Msg("App shutdown error")
	}
	log.Info().Msg("Server stopped")
}
