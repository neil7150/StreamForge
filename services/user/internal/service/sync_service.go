package service

import (
	"context"
	"streamforge/services/user/internal/model"
	"streamforge/services/user/internal/repository"
	"github.com/google/uuid"
)

type SyncService struct {
	repo *repository.SyncRepository
}

func NewSyncService(repo *repository.SyncRepository) *SyncService {
	return &SyncService{repo: repo}
}

func (s *SyncService) GetWatchlist(ctx context.Context, userID uuid.UUID) ([]model.WatchlistItem, error) {
	return s.repo.GetWatchlist(ctx, userID)
}

func (s *SyncService) SyncWatchlist(ctx context.Context, userID uuid.UUID, items []model.WatchlistItem) error {
	return s.repo.UpsertWatchlist(ctx, userID, items)
}

func (s *SyncService) GetHistory(ctx context.Context, userID uuid.UUID) ([]model.WatchHistoryItem, error) {
	return s.repo.GetHistory(ctx, userID)
}

func (s *SyncService) SyncHistory(ctx context.Context, userID uuid.UUID, items []model.WatchHistoryItem) error {
	return s.repo.UpsertHistory(ctx, userID, items)
}
