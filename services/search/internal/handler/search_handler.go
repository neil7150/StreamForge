package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"

	"streamforge/services/search/internal/dto"
	"streamforge/services/search/internal/service"
)

type SearchHandler struct {
	searchService *service.SearchService
	log           zerolog.Logger
}

func NewSearchHandler(searchService *service.SearchService, log zerolog.Logger) *SearchHandler {
	return &SearchHandler{
		searchService: searchService,
		log:           log.With().Str("handler", "search").Logger(),
	}
}

func (h *SearchHandler) Search(c *fiber.Ctx) error {
	var q dto.SearchQuery
	if err := c.QueryParser(&q); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid query parameters"})
	}

	if q.Q == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Query string 'q' is required"})
	}

	items, total, err := h.searchService.Search(c.Context(), q)
	if err != nil {
		h.log.Error().Err(err).Msg("Search failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Internal server error"})
	}

	return c.JSON(fiber.Map{
		"data": items,
		"meta": fiber.Map{
			"total":    total,
			"page":     q.Page,
			"per_page": q.PerPage,
		},
	})
}

func (h *SearchHandler) Suggest(c *fiber.Ctx) error {
	q := c.Query("q")
	if q == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Query string 'q' is required"})
	}

	items, err := h.searchService.Suggest(c.Context(), q)
	if err != nil {
		h.log.Error().Err(err).Msg("Suggest failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Internal server error"})
	}

	return c.JSON(fiber.Map{
		"data": items,
	})
}
