// Package app assembles catalog search for production and integration tests.
package app

import (
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"streamforge.local/pkg/middleware"
	"streamforge/services/search/internal/handler"
	"streamforge/services/search/internal/service"
)

func New(pool *pgxpool.Pool, cache *redis.Client, log zerolog.Logger) *fiber.App {
	app := fiber.New(fiber.Config{DisableStartupMessage: true})
	middleware.Setup(app, log)
	middleware.RegisterMetrics(app, "search")
	app.Get("/health", func(c *fiber.Ctx) error { return c.SendString("OK") })
	handler.SetupRoutes(app, handler.NewSearchHandler(service.NewSearchService(pool, cache, log), log))
	return app
}
