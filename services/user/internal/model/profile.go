package model

import (
	"encoding/json"
	"github.com/google/uuid"
	"time"
)

type UserProfile struct {
	UserID      uuid.UUID       `json:"user_id"`
	DisplayName *string         `json:"display_name,omitempty"`
	AvatarURL   *string         `json:"avatar_url,omitempty"`
	Preferences json.RawMessage `json:"preferences"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type WatchlistItem struct {
	ID         uuid.UUID       `json:"id"`
	UserID     uuid.UUID       `json:"user_id"`
	ContentKey string          `json:"content_key"`
	Title      *string         `json:"title,omitempty"`
	PosterURL  *string         `json:"poster_url,omitempty"`
	Metadata   json.RawMessage `json:"metadata"`
	AddedAt    time.Time       `json:"added_at"`
}

type WatchHistoryItem struct {
	ID          uuid.UUID       `json:"id"`
	UserID      uuid.UUID       `json:"user_id"`
	ContentKey  string          `json:"content_key"`
	Title       *string         `json:"title,omitempty"`
	PosterURL   *string         `json:"poster_url,omitempty"`
	Progress    float64         `json:"progress"`
	CurrentTime *float64        `json:"current_time,omitempty"`
	Duration    *float64        `json:"duration,omitempty"`
	Metadata    json.RawMessage `json:"metadata"`
	WatchedAt   time.Time       `json:"watched_at"`
}

type Snapshot[T any] struct {
	Items    []T
	Revision int64
}
