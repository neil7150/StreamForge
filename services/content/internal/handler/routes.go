package handler

import (
	"github.com/gofiber/fiber/v2"

	"streamforge.local/pkg/auth"
)

// SetupRoutes registers all content service routes.
func SetupRoutes(app *fiber.App, movieH *MovieHandler, genreH *GenreHandler, showH *ShowHandler, jwtSecret string, blacklist auth.TokenBlacklist) {
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

	// ── Show routes (public) ──────────────────────────────
	shows := api.Group("/shows")
	shows.Get("/", showH.ListShows)
	shows.Get("/:slug", showH.GetShow)
	shows.Get("/:id/seasons", showH.GetSeasons)

	episodes := api.Group("/episodes")
	episodes.Get("/:id/magnets", showH.GetEpisodeMagnets)

	// ── Admin routes (require auth + admin role) ─────────
	admin := api.Group("/admin", auth.AuthMiddleware(jwtSecret, blacklist), auth.AdminMiddleware())

	adminMovies := admin.Group("/movies")
	adminMovies.Post("/", movieH.CreateMovie)
	adminMovies.Put("/:id", movieH.UpdateMovie)
	adminMovies.Delete("/:id", movieH.DeleteMovie)
	adminMovies.Post("/:id/magnets", movieH.AddMagnet)

	// ── Admin show routes ────────────────────────────────
	adminShows := admin.Group("/shows")
	adminShows.Post("/", showH.CreateShow)
	adminShows.Put("/:id", showH.UpdateShow)
	adminShows.Delete("/:id", showH.DeleteShow)
	adminShows.Post("/:id/seasons", showH.CreateSeason)

	adminEpisodes := admin.Group("/episodes")
	adminEpisodes.Post("/", showH.CreateEpisode)
	adminEpisodes.Post("/:id/magnets", showH.AddEpisodeMagnet)
}
