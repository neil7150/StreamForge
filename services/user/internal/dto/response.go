package dto

import (
	"encoding/json"
	"github.com/google/uuid"
	"streamforge/services/user/internal/model"
	"time"
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
	Items    []WatchlistItemDTO `json:"items"`
	Revision int64              `json:"revision"`
}

type HistoryResponse struct {
	Items    []HistoryItemDTO `json:"items"`
	Revision int64            `json:"revision"`
}
