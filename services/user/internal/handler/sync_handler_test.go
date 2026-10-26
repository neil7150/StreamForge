package handler

import (
	"context"
	"encoding/json"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"net/http/httptest"
	"os"
	"reflect"
	"streamforge/services/user/internal/model"
	"streamforge/services/user/internal/repository"
	"streamforge/services/user/internal/service"
	"strings"
	"testing"
	"time"
)

type contractStore struct{ conflict bool }

func (s *contractStore) GetWatchlist(context.Context, uuid.UUID) (model.Snapshot[model.WatchlistItem], error) {
	title, poster := "Controlled fixture", ""
	at, _ := time.Parse(time.RFC3339, "2026-10-24T10:00:00Z")
	return model.Snapshot[model.WatchlistItem]{Revision: 7, Items: []model.WatchlistItem{{ID: uuid.MustParse("11111111-1111-4111-8111-111111111111"), ContentKey: "movie:fixture", Title: &title, PosterURL: &poster, Metadata: []byte(`{"slug":"fixture","contentType":"movie"}`), AddedAt: at}}}, nil
}
func (s *contractStore) GetHistory(context.Context, uuid.UUID) (model.Snapshot[model.WatchHistoryItem], error) {
	return model.Snapshot[model.WatchHistoryItem]{Items: []model.WatchHistoryItem{}, Revision: 3}, nil
}
func (s *contractStore) UpsertWatchlist(_ context.Context, _ uuid.UUID, _ []model.WatchlistItem, rev int64) (int64, error) {
	if s.conflict {
		return rev, repository.ErrSyncConflict
	}
	return rev + 1, nil
}
func (s *contractStore) UpsertHistory(_ context.Context, _ uuid.UUID, _ []model.WatchHistoryItem, rev int64) (int64, error) {
	return rev + 1, nil
}
func contractApp(store *contractStore) *fiber.App {
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", uuid.MustParse("22222222-2222-4222-8222-222222222222"))
		return c.Next()
	})
	h := NewSyncHandler(service.NewSyncService(store))
	app.Get("/watchlist", h.GetWatchlist)
	app.Get("/history", h.GetHistory)
	app.Put("/watchlist", h.SyncWatchlist)
	return app
}
func TestLibraryHTTPMatchesSharedContract(t *testing.T) {
	data, err := os.ReadFile("../../../../contracts/library-snapshots.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures map[string]any
	if err = json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	app := contractApp(&contractStore{})
	for _, kind := range []string{"watchlist", "history"} {
		res, err := app.Test(httptest.NewRequest("GET", "/"+kind, nil))
		if err != nil {
			t.Fatal(err)
		}
		var actual any
		err = json.NewDecoder(res.Body).Decode(&actual)
		res.Body.Close()
		if err != nil || res.StatusCode != 200 || !reflect.DeepEqual(actual, fixtures[kind]) {
			t.Fatalf("%s contract mismatch: %#v (%v)", kind, actual, err)
		}
	}
}
func TestSyncHTTPRejectsUnversionedAndConflictingWrites(t *testing.T) {
	store := &contractStore{}
	app := contractApp(store)
	for _, tc := range []struct {
		body     string
		conflict bool
		status   int
	}{{`{"items":[]}`, false, 400}, {`{"revision":0}`, false, 400}, {`{"items":[],"revision":0}`, true, 409}, {`{"items":[],"revision":0}`, false, 200}, {`{"items":[{"content_key":""}],"revision":0}`, false, 400}} {
		store.conflict = tc.conflict
		req := httptest.NewRequest("PUT", "/watchlist", strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != tc.status {
			t.Fatalf("%s: got %d want %d", tc.body, res.StatusCode, tc.status)
		}
	}
}
