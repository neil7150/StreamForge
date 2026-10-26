package repository

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"streamforge/services/user/internal/model"
	"time"
)

var ErrSyncConflict = errors.New("library changed on the server; reload before syncing")

type SyncDB interface {
	Begin(context.Context) (pgx.Tx, error)
}
type SyncRepository struct{ db SyncDB }

func NewSyncRepository(db SyncDB) *SyncRepository { return &SyncRepository{db: db} }

// Reads and replacements share a per-account/collection row lock. A snapshot's
// items and revision are read atomically; stale writes fail before any deletion.
func (r *SyncRepository) collection(ctx context.Context, userID uuid.UUID, name string, expected *int64, action func(pgx.Tx) error) (int64, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `INSERT INTO library_sync_revisions (user_id, collection) VALUES ($1, $2) ON CONFLICT DO NOTHING`, userID, name); err != nil {
		return 0, err
	}
	var revision int64
	if err = tx.QueryRow(ctx, `SELECT revision FROM library_sync_revisions WHERE user_id = $1 AND collection = $2 FOR UPDATE`, userID, name).Scan(&revision); err != nil {
		return 0, err
	}
	if expected != nil && *expected != revision {
		return revision, ErrSyncConflict
	}
	if err = action(tx); err != nil {
		return revision, err
	}
	if expected != nil {
		revision++
		if _, err = tx.Exec(ctx, `UPDATE library_sync_revisions SET revision = $3 WHERE user_id = $1 AND collection = $2`, userID, name, revision); err != nil {
			return 0, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, err
	}
	return revision, nil
}

func (r *SyncRepository) GetWatchlist(ctx context.Context, userID uuid.UUID) (model.Snapshot[model.WatchlistItem], error) {
	result := model.Snapshot[model.WatchlistItem]{Items: []model.WatchlistItem{}}
	revision, err := r.collection(ctx, userID, "watchlist", nil, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT id, user_id, content_key, title, poster_url, metadata, added_at FROM watchlist_items WHERE user_id = $1 ORDER BY added_at DESC`, userID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var item model.WatchlistItem
			if err := rows.Scan(&item.ID, &item.UserID, &item.ContentKey, &item.Title, &item.PosterURL, &item.Metadata, &item.AddedAt); err != nil {
				return err
			}
			result.Items = append(result.Items, item)
		}
		return rows.Err()
	})
	result.Revision = revision
	return result, err
}

func (r *SyncRepository) UpsertWatchlist(ctx context.Context, userID uuid.UUID, items []model.WatchlistItem, expected int64) (int64, error) {
	return r.collection(ctx, userID, "watchlist", &expected, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM watchlist_items WHERE user_id = $1`, userID); err != nil {
			return err
		}
		for _, item := range items {
			if _, err := tx.Exec(ctx, `INSERT INTO watchlist_items (id, user_id, content_key, title, poster_url, metadata, added_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, item.ID, userID, item.ContentKey, item.Title, item.PosterURL, item.Metadata, item.AddedAt); err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *SyncRepository) GetHistory(ctx context.Context, userID uuid.UUID) (model.Snapshot[model.WatchHistoryItem], error) {
	result := model.Snapshot[model.WatchHistoryItem]{Items: []model.WatchHistoryItem{}}
	revision, err := r.collection(ctx, userID, "history", nil, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT id, user_id, content_key, title, poster_url, progress, "current_time", duration, metadata, watched_at FROM watch_history WHERE user_id = $1 ORDER BY watched_at DESC`, userID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var item model.WatchHistoryItem
			if err := rows.Scan(&item.ID, &item.UserID, &item.ContentKey, &item.Title, &item.PosterURL, &item.Progress, &item.CurrentTime, &item.Duration, &item.Metadata, &item.WatchedAt); err != nil {
				return err
			}
			result.Items = append(result.Items, item)
		}
		return rows.Err()
	})
	result.Revision = revision
	return result, err
}

func (r *SyncRepository) UpsertHistory(ctx context.Context, userID uuid.UUID, items []model.WatchHistoryItem, expected int64) (int64, error) {
	return r.collection(ctx, userID, "history", &expected, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM watch_history WHERE user_id = $1`, userID); err != nil {
			return err
		}
		for _, item := range items {
			if _, err := tx.Exec(ctx, `INSERT INTO watch_history (id, user_id, content_key, title, poster_url, progress, "current_time", duration, metadata, watched_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, item.ID, userID, item.ContentKey, item.Title, item.PosterURL, item.Progress, item.CurrentTime, item.Duration, item.Metadata, item.WatchedAt); err != nil {
				return err
			}
		}
		return nil
	})
}
