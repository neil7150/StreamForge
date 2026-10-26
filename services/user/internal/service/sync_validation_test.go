package service

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"streamforge/services/user/internal/model"
	"testing"
	"time"
)

type memorySyncStore struct {
	watchlist []model.WatchlistItem
	history   []model.WatchHistoryItem
	revision  int64
	calls     int
}

func (s *memorySyncStore) GetWatchlist(context.Context, uuid.UUID) (model.Snapshot[model.WatchlistItem], error) {
	return model.Snapshot[model.WatchlistItem]{Items: s.watchlist, Revision: s.revision}, nil
}
func (s *memorySyncStore) GetHistory(context.Context, uuid.UUID) (model.Snapshot[model.WatchHistoryItem], error) {
	return model.Snapshot[model.WatchHistoryItem]{Items: s.history, Revision: s.revision}, nil
}
func (s *memorySyncStore) UpsertWatchlist(_ context.Context, _ uuid.UUID, items []model.WatchlistItem, rev int64) (int64, error) {
	s.calls++
	s.watchlist = items
	return rev + 1, nil
}
func (s *memorySyncStore) UpsertHistory(_ context.Context, _ uuid.UUID, items []model.WatchHistoryItem, rev int64) (int64, error) {
	s.calls++
	s.history = items
	return rev + 1, nil
}

func TestSyncGeneratesStableAccountScopedIDsAndTimestamps(t *testing.T) {
	repo := &memorySyncStore{}
	svc := NewSyncService(repo)
	account := uuid.New()
	now := time.Now()
	items := []model.WatchlistItem{{ContentKey: "one"}, {ContentKey: "two", ID: uuid.New(), UserID: uuid.New()}}
	revision, err := svc.SyncWatchlist(context.Background(), account, items, 4)
	if err != nil || revision != 5 {
		t.Fatalf("sync: %d %v", revision, err)
	}
	a, b := repo.watchlist[0], repo.watchlist[1]
	if a.ID == uuid.Nil || a.ID == b.ID || a.UserID != account || b.UserID != account || a.AddedAt.Before(now) || len(a.Metadata) == 0 || a.Title == nil || a.PosterURL == nil {
		t.Fatalf("invalid normalized items: %+v", repo.watchlist)
	}
	if _, err = svc.SyncWatchlist(context.Background(), account, []model.WatchlistItem{{ContentKey: "one"}}, 5); err != nil {
		t.Fatal(err)
	}
	if repo.watchlist[0].ID != a.ID {
		t.Fatal("same account/key must keep its identity")
	}
	if _, err = svc.SyncWatchlist(context.Background(), uuid.New(), []model.WatchlistItem{{ContentKey: "one"}}, 0); err != nil {
		t.Fatal(err)
	}
	if repo.watchlist[0].ID == a.ID {
		t.Fatal("different accounts must not share an item ID")
	}
}

func TestSyncRejectsInvalidSnapshotsBeforeRepositoryWrites(t *testing.T) {
	repo := &memorySyncStore{}
	svc := NewSyncService(repo)
	ctx := context.Background()
	id := uuid.New()
	for _, items := range [][]model.WatchlistItem{nil, {{ContentKey: ""}}, {{ContentKey: "x"}, {ContentKey: "x"}}, {{ContentKey: "x", Metadata: []byte(`[]`)}}} {
		if _, err := svc.SyncWatchlist(ctx, id, items, 0); !errors.Is(err, ErrInvalidSync) {
			t.Fatalf("accepted invalid snapshot: %v", err)
		}
	}
	negative := -1.0
	if _, err := svc.SyncHistory(ctx, id, []model.WatchHistoryItem{{ContentKey: "x", CurrentTime: &negative}}, 0); !errors.Is(err, ErrInvalidSync) {
		t.Fatal("accepted negative playback time")
	}
	if repo.calls != 0 {
		t.Fatal("invalid input reached database")
	}
	if _, err := svc.SyncWatchlist(ctx, id, []model.WatchlistItem{}, 1); err != nil {
		t.Fatal("explicit revisioned empty collection must allow user clearing", err)
	}
}
