// Package middleware provides common Fiber middleware for all services.
package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
	"github.com/rs/zerolog"
)

// Setup applies standard middleware to a Fiber app.
func Setup(app *fiber.App, log zerolog.Logger) {
	// Recovery from panics
	app.Use(recover.New(recover.Config{
		EnableStackTrace: true,
	}))

	// Request ID for tracing
	app.Use(requestid.New())

	// CORS
	app.Use(cors.New(cors.Config{
		AllowOrigins:     "*",
		AllowMethods:     "GET,POST,PUT,DELETE,PATCH,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization,X-Request-ID",
		ExposeHeaders:    "X-Request-ID",
		AllowCredentials: false,
		MaxAge:           3600,
	}))

	// Request logging
	app.Use(func(c *fiber.Ctx) error {
		err := c.Next()
		log.Info().
			Str("method", c.Method()).
			Str("path", c.Path()).
			Int("status", c.Response().StatusCode()).
			Str("request_id", c.Locals("requestid").(string)).
			Str("ip", c.IP()).
			Msg("request")
		return err
	})
}
