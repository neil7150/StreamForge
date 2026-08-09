package handler

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"

	"streamforge.local/pkg/response"
	"streamforge/services/content/internal/dto"
	"streamforge/services/content/internal/service"
)

// GenreHandler handles HTTP requests for genres.
type GenreHandler struct {
	svc *service.GenreService
	log zerolog.Logger
}

// NewGenreHandler creates a new GenreHandler.
func NewGenreHandler(svc *service.GenreService, log zerolog.Logger) *GenreHandler {
	return &GenreHandler{svc: svc, log: log}
}

// ListGenres handles GET /api/v1/genres
func (h *GenreHandler) ListGenres(c *fiber.Ctx) error {
	genres, err := h.svc.ListGenres(c.Context())
	if err != nil {
		h.log.Error().Err(err).Msg("Failed to list genres")
		return response.InternalError(c, "Failed to fetch genres")
	}

	results := make([]dto.GenreResponse, len(genres))
	for i, g := range genres {
		results[i] = dto.ToGenreResponse(g)
	}

	return response.OK(c, results)
}

// GetGenreContent handles GET /api/v1/genres/:slug/content
func (h *GenreHandler) GetGenreContent(c *fiber.Ctx) error {
	slug := c.Params("slug")
	if slug == "" {
		return response.BadRequest(c, "Genre slug is required")
	}

	page, _ := strconv.Atoi(c.Query("page", "1"))
	perPage, _ := strconv.Atoi(c.Query("per_page", "20"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}

	content, total, err := h.svc.GetGenreContent(c.Context(), slug, page, perPage)
	if err != nil {
		h.log.Error().Err(err).Str("slug", slug).Msg("Failed to get genre content")
		return response.NotFound(c, "Genre not found")
	}

	results := make([]dto.MovieResponse, len(content))
	for i, movie := range content {
		results[i] = dto.ToMovieResponse(movie, h.svc.GetMagnetCount(c.Context(), movie.ID))
	}

	return response.Paginated(c, results, page, perPage, total)
}
