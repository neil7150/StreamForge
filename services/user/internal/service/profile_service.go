package service

import (
	"context"
	"streamforge/services/user/internal/model"
	"streamforge/services/user/internal/repository"
	"github.com/google/uuid"
)

type ProfileService struct {
	repo *repository.ProfileRepository
}

func NewProfileService(repo *repository.ProfileRepository) *ProfileService {
	return &ProfileService{repo: repo}
}

func (s *ProfileService) GetProfile(ctx context.Context, userID uuid.UUID) (*model.UserProfile, error) {
	return s.repo.GetByUserID(ctx, userID)
}

func (s *ProfileService) UpdateProfile(ctx context.Context, profile model.UserProfile) error {
	return s.repo.Upsert(ctx, profile)
}
