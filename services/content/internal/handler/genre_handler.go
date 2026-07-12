package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"

	"streamforge/pkg/response"
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

	content, err := h.svc.GetGenreContent(c.Context(), slug)
	if err != nil {
		h.log.Error().Err(err).Str("slug", slug).Msg("Failed to get genre content")
		return response.NotFound(c, "Genre not found")
	}

	return response.OK(c, content)
}
