package dto

import (
	"encoding/json"
	"time"
	"github.com/google/uuid"
)

type UpdateProfileRequest struct {
	DisplayName *string         `json:"display_name"`
	AvatarURL   *string         `json:"avatar_url"`
	Preferences json.RawMessage `json:"preferences"`
}

type SyncWatchlistRequest struct {
	Items []WatchlistItemDTO `json:"items"`
}

type WatchlistItemDTO struct {
	ID         uuid.UUID       `json:"id"`
	ContentKey string          `json:"content_key"`
	Title      *string         `json:"title"`
	PosterURL  *string         `json:"poster_url"`
	Metadata   json.RawMessage `json:"metadata"`
	AddedAt    time.Time       `json:"added_at"`
}

type SyncHistoryRequest struct {
	Items []HistoryItemDTO `json:"items"`
}

type HistoryItemDTO struct {
	ID          uuid.UUID       `json:"id"`
	ContentKey  string          `json:"content_key"`
	Title       *string         `json:"title"`
	PosterURL   *string         `json:"poster_url"`
	Progress    float64         `json:"progress"`
	CurrentTime *float64        `json:"current_time"`
	Duration    *float64        `json:"duration"`
	Metadata    json.RawMessage `json:"metadata"`
	WatchedAt   time.Time       `json:"watched_at"`
}
