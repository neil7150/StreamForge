package dto

import (
	"streamforge/services/user/internal/model"
	"encoding/json"
	"time"
	"github.com/google/uuid"
)

type ProfileResponse struct {
	UserID      uuid.UUID       `json:"user_id"`
	DisplayName *string         `json:"display_name"`
	AvatarURL   *string         `json:"avatar_url"`
	Preferences json.RawMessage `json:"preferences"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

func ToProfileResponse(p *model.UserProfile) ProfileResponse {
	return ProfileResponse{
		UserID:      p.UserID,
		DisplayName: p.DisplayName,
		AvatarURL:   p.AvatarURL,
		Preferences: p.Preferences,
		CreatedAt:   p.CreatedAt,
		UpdatedAt:   p.UpdatedAt,
	}
}

type WatchlistResponse struct {
	Items []WatchlistItemDTO `json:"items"`
}

type HistoryResponse struct {
	Items []HistoryItemDTO `json:"items"`
}
