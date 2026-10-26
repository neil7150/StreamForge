// Package app assembles the user HTTP application for production and integration tests.
package app

import (
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
	"streamforge.local/pkg/auth"
	"streamforge.local/pkg/middleware"
	"streamforge/services/user/internal/handler"
	"streamforge/services/user/internal/repository"
	"streamforge/services/user/internal/service"
)

func New(pool *pgxpool.Pool, secret string, blacklist auth.TokenBlacklist, log zerolog.Logger) *fiber.App {
	profileH := handler.NewProfileHandler(service.NewProfileService(repository.NewProfileRepository(pool)))
	syncH := handler.NewSyncHandler(service.NewSyncService(repository.NewSyncRepository(pool)))
	app := fiber.New(fiber.Config{DisableStartupMessage: true})
	middleware.Setup(app, log)
	middleware.RegisterMetrics(app, "user")
	app.Get("/health", func(c *fiber.Ctx) error { return c.SendString("OK") })
	handler.SetupRoutes(app, profileH, syncH, secret, blacklist)
	return app
}
