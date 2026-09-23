package handler

import (
	"streamforge.local/pkg/auth"
	"github.com/gofiber/fiber/v2"
)

func SetupRoutes(app *fiber.App, profileH *ProfileHandler, syncH *SyncHandler, jwtSecret string, blacklist auth.TokenBlacklist) {
	api := app.Group("/api/v1", auth.AuthMiddleware(jwtSecret, blacklist))
	api.Get("/profile", profileH.GetProfile)
	api.Put("/profile", profileH.UpdateProfile)
	api.Get("/sync/watchlist", syncH.GetWatchlist)
	api.Put("/sync/watchlist", syncH.SyncWatchlist)
	api.Get("/sync/history", syncH.GetHistory)
	api.Put("/sync/history", syncH.SyncHistory)
}
