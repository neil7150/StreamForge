package handler

import (
	"github.com/gofiber/fiber/v2"
	"streamforge.local/pkg/auth"
)

// SetupRoutes registers all authentication routes on the Fiber app.
func SetupRoutes(app *fiber.App, handler *AuthHandler, jwtSecret string, blacklist auth.TokenBlacklist) {
	authGroup := app.Group("/auth")

	// Public routes — no authentication required
	authGroup.Post("/register", handler.Register)
	authGroup.Post("/login", handler.Login)
	authGroup.Post("/refresh", handler.Refresh)

	// Protected routes — require valid JWT
	protected := authGroup.Group("", auth.AuthMiddleware(jwtSecret, blacklist))
	protected.Post("/logout", handler.Logout)
	protected.Get("/me", handler.Me)
}
