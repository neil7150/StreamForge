package handler

import (
	"errors"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"streamforge.local/pkg/response"
	"streamforge/services/user/internal/dto"
	"streamforge/services/user/internal/model"
	"streamforge/services/user/internal/repository"
	"streamforge/services/user/internal/service"
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
		return response.InternalError(c, "Failed to get watchlist")
	}

	dtoItems := make([]dto.WatchlistItemDTO, 0, len(items.Items))
	for _, item := range items.Items {
		dtoItems = append(dtoItems, dto.WatchlistItemDTO{
			ID:         item.ID,
			ContentKey: item.ContentKey,
			Title:      cloudText(item.Title),
			PosterURL:  cloudText(item.PosterURL),
			Metadata:   item.Metadata,
			AddedAt:    item.AddedAt,
		})
	}

	return response.OK(c, dto.WatchlistResponse{Items: dtoItems, Revision: items.Revision})
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

	if req.Revision == nil || req.Items == nil {
		return response.BadRequest(c, "An items array and revision are required")
	}
	modelItems := make([]model.WatchlistItem, 0, len(req.Items))
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

	revision, err := h.service.SyncWatchlist(c.Context(), userID, modelItems, *req.Revision)
	if err != nil {
		return syncError(c, err)
	}

	return response.OK(c, fiber.Map{"revision": revision})
}

func (h *SyncHandler) GetHistory(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return response.Unauthorized(c, "Invalid user ID")
	}

	items, err := h.service.GetHistory(c.Context(), userID)
	if err != nil {
		return response.InternalError(c, "Failed to get history")
	}

	dtoItems := make([]dto.HistoryItemDTO, 0, len(items.Items))
	for _, item := range items.Items {
		dtoItems = append(dtoItems, dto.HistoryItemDTO{
			ID:          item.ID,
			ContentKey:  item.ContentKey,
			Title:       cloudText(item.Title),
			PosterURL:   cloudText(item.PosterURL),
			Progress:    item.Progress,
			CurrentTime: item.CurrentTime,
			Duration:    item.Duration,
			Metadata:    item.Metadata,
			WatchedAt:   item.WatchedAt,
		})
	}

	return response.OK(c, dto.HistoryResponse{Items: dtoItems, Revision: items.Revision})
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

	if req.Revision == nil || req.Items == nil {
		return response.BadRequest(c, "An items array and revision are required")
	}
	modelItems := make([]model.WatchHistoryItem, 0, len(req.Items))
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

	revision, err := h.service.SyncHistory(c.Context(), userID, modelItems, *req.Revision)
	if err != nil {
		return syncError(c, err)
	}

	return response.OK(c, fiber.Map{"revision": revision})
}

func syncError(c *fiber.Ctx, err error) error {
	if errors.Is(err, repository.ErrSyncConflict) {
		return response.Conflict(c, err.Error())
	}
	if errors.Is(err, service.ErrInvalidSync) {
		return response.BadRequest(c, err.Error())
	}
	return response.InternalError(c, "Failed to sync library")
}

func cloudText(value *string) *string {
	if value == nil {
		empty := ""
		return &empty
	}
	return value
}
