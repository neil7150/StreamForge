package service

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"math"
	"streamforge/services/user/internal/model"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrInvalidSync = errors.New("invalid library snapshot")

type SyncStore interface {
	GetWatchlist(context.Context, uuid.UUID) (model.Snapshot[model.WatchlistItem], error)
	UpsertWatchlist(context.Context, uuid.UUID, []model.WatchlistItem, int64) (int64, error)
	GetHistory(context.Context, uuid.UUID) (model.Snapshot[model.WatchHistoryItem], error)
	UpsertHistory(context.Context, uuid.UUID, []model.WatchHistoryItem, int64) (int64, error)
}
type SyncService struct{ repo SyncStore }

func NewSyncService(repo SyncStore) *SyncService { return &SyncService{repo: repo} }
func (s *SyncService) GetWatchlist(ctx context.Context, id uuid.UUID) (model.Snapshot[model.WatchlistItem], error) {
	return s.repo.GetWatchlist(ctx, id)
}
func (s *SyncService) GetHistory(ctx context.Context, id uuid.UUID) (model.Snapshot[model.WatchHistoryItem], error) {
	return s.repo.GetHistory(ctx, id)
}

func validItem(key string, title *string, metadata json.RawMessage, seen map[string]bool) bool {
	if strings.TrimSpace(key) == "" || utf8.RuneCountInString(key) > 255 || seen[key] || (title != nil && utf8.RuneCountInString(*title) > 500) || len(metadata) > 65536 {
		return false
	}
	var object map[string]json.RawMessage
	if len(metadata) > 0 && (json.Unmarshal(metadata, &object) != nil || object == nil) {
		return false
	}
	seen[key] = true
	return true
}
func normalizeTime(value time.Time, now time.Time) time.Time {
	if value.IsZero() || value.Before(time.Unix(0, 0)) || value.After(now.Add(5*time.Minute)) {
		return now
	}
	return value.UTC()
}
func (s *SyncService) SyncWatchlist(ctx context.Context, id uuid.UUID, items []model.WatchlistItem, revision int64) (int64, error) {
	if items == nil || len(items) > 5000 || revision < 0 {
		return 0, ErrInvalidSync
	}
	seen := map[string]bool{}
	now := time.Now().UTC()
	for i := range items {
		item := &items[i]
		if !validItem(item.ContentKey, item.Title, item.Metadata, seen) {
			return 0, ErrInvalidSync
		}
		item.ID = uuid.NewSHA1(id, []byte("watchlist:"+item.ContentKey))
		item.UserID = id
		item.Title = libraryText(item.Title)
		item.PosterURL = libraryText(item.PosterURL)
		item.AddedAt = normalizeTime(item.AddedAt, now)
		if len(item.Metadata) == 0 {
			item.Metadata = json.RawMessage(`{}`)
		}
	}
	return s.repo.UpsertWatchlist(ctx, id, items, revision)
}
func (s *SyncService) SyncHistory(ctx context.Context, id uuid.UUID, items []model.WatchHistoryItem, revision int64) (int64, error) {
	if items == nil || len(items) > 50 || revision < 0 {
		return 0, ErrInvalidSync
	}
	seen := map[string]bool{}
	now := time.Now().UTC()
	for i := range items {
		item := &items[i]
		if !validItem(item.ContentKey, item.Title, item.Metadata, seen) || math.IsNaN(item.Progress) || math.IsInf(item.Progress, 0) || item.Progress < 0 || item.Progress > 1 {
			return 0, ErrInvalidSync
		}
		for _, value := range []*float64{item.CurrentTime, item.Duration} {
			if value != nil && (math.IsNaN(*value) || math.IsInf(*value, 0) || *value < 0 || *value >= 1e8) {
				return 0, ErrInvalidSync
			}
		}
		item.ID = uuid.NewSHA1(id, []byte("history:"+item.ContentKey))
		item.UserID = id
		item.Title = libraryText(item.Title)
		item.PosterURL = libraryText(item.PosterURL)
		item.WatchedAt = normalizeTime(item.WatchedAt, now)
		if len(item.Metadata) == 0 {
			item.Metadata = json.RawMessage(`{}`)
		}
	}
	return s.repo.UpsertHistory(ctx, id, items, revision)
}

func libraryText(value *string) *string {
	if value == nil {
		empty := ""
		return &empty
	}
	return value
}
