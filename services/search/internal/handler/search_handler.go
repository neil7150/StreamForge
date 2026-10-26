package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
	"streamforge.local/pkg/response"
	"strings"
	"unicode/utf8"

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
		return response.BadRequest(c, "Invalid query parameters")
	}

	q.Normalize()
	if q.Q == "" || utf8.RuneCountInString(q.Q) > 200 {
		return response.BadRequest(c, "Query must contain between 1 and 200 characters")
	}

	items, total, err := h.searchService.Search(c.Context(), q)
	if err != nil {
		h.log.Error().Err(err).Msg("Search failed")
		return response.InternalError(c, "Search is unavailable")
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
	q := strings.TrimSpace(c.Query("q"))
	if q == "" || utf8.RuneCountInString(q) > 200 {
		return response.BadRequest(c, "Query must contain between 1 and 200 characters")
	}

	items, err := h.searchService.Suggest(c.Context(), q)
	if err != nil {
		h.log.Error().Err(err).Msg("Suggest failed")
		return response.InternalError(c, "Suggestions are unavailable")
	}

	return c.JSON(fiber.Map{
		"data": items,
	})
}
