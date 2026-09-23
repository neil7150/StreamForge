package handler

import (
	"github.com/gofiber/fiber/v2"
)

func SetupRoutes(app *fiber.App, searchH *SearchHandler) {
	api := app.Group("/api/v1")
	api.Get("/search", searchH.Search)
	api.Get("/search/suggest", searchH.Suggest)
}
