package handler

import (
	"github.com/gofiber/fiber/v2"

	"streamforge/pkg/auth"
)

// SetupRoutes registers all content service routes.
func SetupRoutes(app *fiber.App, movieH *MovieHandler, genreH *GenreHandler, jwtSecret string) {
	api := app.Group("/api/v1")

	// ── Public routes (no auth required) ─────────────────
	movies := api.Group("/movies")
	movies.Get("/trending", movieH.GetTrending)
	movies.Get("/recent", movieH.GetRecent)
	movies.Get("/", movieH.ListMovies)
	movies.Get("/:slug", movieH.GetMovie)
	movies.Get("/:id/magnets", movieH.GetMovieMagnets)
	movies.Get("/:id/subtitles", movieH.GetMovieSubtitles)

	genres := api.Group("/genres")
	genres.Get("/", genreH.ListGenres)
	genres.Get("/:slug/content", genreH.GetGenreContent)

	// ── Admin routes (require auth + admin role) ─────────
	admin := api.Group("/admin", auth.AuthMiddleware(jwtSecret), auth.AdminMiddleware())

	adminMovies := admin.Group("/movies")
	adminMovies.Post("/", movieH.CreateMovie)
	adminMovies.Put("/:id", movieH.UpdateMovie)
	adminMovies.Delete("/:id", movieH.DeleteMovie)
	adminMovies.Post("/:id/magnets", movieH.AddMagnet)
}
