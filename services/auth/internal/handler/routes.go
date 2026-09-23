package handler

import (
	"github.com/gofiber/fiber/v2"
	"streamforge.local/pkg/auth"
)

// SetupRoutes registers all authentication routes on the Fiber app.
func SetupRoutes(app *fiber.App, handler *AuthHandler, oauthHandler *OAuthHandler, jwtSecret string, blacklist auth.TokenBlacklist) {
	authGroup := app.Group("/auth")

	// Public routes — no authentication required
	authGroup.Post("/register", handler.Register)
	authGroup.Post("/login", handler.Login)
	authGroup.Post("/refresh", handler.Refresh)
	authGroup.Post("/verify-email", handler.VerifyEmail)

	// OAuth routes
	if oauthHandler != nil {
		authGroup.Get("/oauth/:provider", oauthHandler.GetAuthURL)
		authGroup.Get("/oauth/:provider/callback", oauthHandler.Callback)
		authGroup.Post("/oauth/:provider/exchange", oauthHandler.Exchange)
	}

	// Protected routes — require valid JWT
	protected := authGroup.Group("", auth.AuthMiddleware(jwtSecret, blacklist))
	protected.Post("/logout", handler.Logout)
	protected.Get("/me", handler.Me)
	protected.Post("/verify-email/request", handler.RequestVerification)
}
