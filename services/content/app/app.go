// Package app assembles the catalog application for production and integration tests.
package app

import (
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"streamforge.local/pkg/auth"
	"streamforge.local/pkg/middleware"
	"streamforge/services/content/internal/handler"
	"streamforge/services/content/internal/repository"
	"streamforge/services/content/internal/service"
	"time"
)

func New(pool *pgxpool.Pool, cache *redis.Client, secret string, blacklist auth.TokenBlacklist, log zerolog.Logger) *fiber.App {
	movies := repository.NewMovieRepository(pool)
	genres := repository.NewGenreRepository(pool)
	magnets := repository.NewMagnetRepository(pool)
	subtitles := repository.NewSubtitleRepository(pool)
	movieH := handler.NewMovieHandler(service.NewContentService(movies, magnets, subtitles, cache, log), log)
	genreH := handler.NewGenreHandler(service.NewGenreService(genres, movies, cache, log), log)
	showH := handler.NewShowHandler(service.NewShowService(repository.NewShowRepository(pool), genres, magnets, subtitles, cache, log), log)
	app := fiber.New(fiber.Config{
		AppName: "StreamForge Content Service", ReadTimeout: 10 * time.Second, WriteTimeout: 30 * time.Second,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code, message := fiber.StatusInternalServerError, "Internal server error"
			if e, ok := err.(*fiber.Error); ok {
				code, message = e.Code, e.Message
			}
			return c.Status(code).JSON(fiber.Map{"success": false, "error": fiber.Map{"code": "INTERNAL_ERROR", "message": message}})
		},
	})
	middleware.Setup(app, log)
	middleware.RegisterMetrics(app, "content")
	app.Get("/health", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok", "service": "content"}) })
	handler.SetupRoutes(app, movieH, genreH, showH, secret, blacklist)
	return app
}
