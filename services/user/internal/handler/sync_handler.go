package handler

import (
	"streamforge/services/user/internal/dto"
	"streamforge/services/user/internal/model"
	"streamforge/services/user/internal/service"
	"streamforge.local/pkg/response"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type SyncHandler struct {
	service *service.SyncService
}

func NewSyncHandler(s *service.SyncService) *SyncHandler {
	return &SyncHandler{service: s}
}

func (h *SyncHandler) GetWatchlist(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return response.Unauthorized(c, "Invalid user ID")
	}

	items, err := h.service.GetWatchlist(c.Context(), userID)
	if err != nil {
		return response.InternalServerError(c, "Failed to get watchlist")
	}

	var dtoItems []dto.WatchlistItemDTO
	for _, item := range items {
		dtoItems = append(dtoItems, dto.WatchlistItemDTO{
			ID:         item.ID,
			ContentKey: item.ContentKey,
			Title:      item.Title,
			PosterURL:  item.PosterURL,
			Metadata:   item.Metadata,
			AddedAt:    item.AddedAt,
		})
	}

	return response.Success(c, dto.WatchlistResponse{Items: dtoItems})
}

func (h *SyncHandler) SyncWatchlist(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return response.Unauthorized(c, "Invalid user ID")
	}

	var req dto.SyncWatchlistRequest
	if err := c.BodyParser(&req); err != nil {
		return response.BadRequest(c, "Invalid request body")
	}

	var modelItems []model.WatchlistItem
	for _, item := range req.Items {
		modelItems = append(modelItems, model.WatchlistItem{
			ID:         item.ID,
			UserID:     userID,
			ContentKey: item.ContentKey,
			Title:      item.Title,
			PosterURL:  item.PosterURL,
			Metadata:   item.Metadata,
			AddedAt:    item.AddedAt,
		})
	}

	if err := h.service.SyncWatchlist(c.Context(), userID, modelItems); err != nil {
		return response.InternalServerError(c, "Failed to sync watchlist")
	}

	return response.Success(c, fiber.Map{"status": "success"})
}

func (h *SyncHandler) GetHistory(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return response.Unauthorized(c, "Invalid user ID")
	}

	items, err := h.service.GetHistory(c.Context(), userID)
	if err != nil {
		return response.InternalServerError(c, "Failed to get history")
	}

	var dtoItems []dto.HistoryItemDTO
	for _, item := range items {
		dtoItems = append(dtoItems, dto.HistoryItemDTO{
			ID:          item.ID,
			ContentKey:  item.ContentKey,
			Title:       item.Title,
			PosterURL:   item.PosterURL,
			Progress:    item.Progress,
			CurrentTime: item.CurrentTime,
			Duration:    item.Duration,
			Metadata:    item.Metadata,
			WatchedAt:   item.WatchedAt,
		})
	}

	return response.Success(c, dto.HistoryResponse{Items: dtoItems})
}

func (h *SyncHandler) SyncHistory(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return response.Unauthorized(c, "Invalid user ID")
	}

	var req dto.SyncHistoryRequest
	if err := c.BodyParser(&req); err != nil {
		return response.BadRequest(c, "Invalid request body")
	}

	var modelItems []model.WatchHistoryItem
	for _, item := range req.Items {
		modelItems = append(modelItems, model.WatchHistoryItem{
			ID:          item.ID,
			UserID:      userID,
			ContentKey:  item.ContentKey,
			Title:       item.Title,
			PosterURL:   item.PosterURL,
			Progress:    item.Progress,
			CurrentTime: item.CurrentTime,
			Duration:    item.Duration,
			Metadata:    item.Metadata,
			WatchedAt:   item.WatchedAt,
		})
	}

	if err := h.service.SyncHistory(c.Context(), userID, modelItems); err != nil {
		return response.InternalServerError(c, "Failed to sync history")
	}

	return response.Success(c, fiber.Map{"status": "success"})
}
