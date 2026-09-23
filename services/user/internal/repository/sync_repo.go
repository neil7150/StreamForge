package repository

import (
	"context"
	"streamforge/services/user/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/google/uuid"
)

type SyncRepository struct {
	db *pgxpool.Pool
}

func NewSyncRepository(db *pgxpool.Pool) *SyncRepository {
	return &SyncRepository{db: db}
}

func (r *SyncRepository) GetWatchlist(ctx context.Context, userID uuid.UUID) ([]model.WatchlistItem, error) {
	query := `SELECT id, user_id, content_key, title, poster_url, metadata, added_at FROM watchlist_items WHERE user_id = $1 ORDER BY added_at DESC`
	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.WatchlistItem
	for rows.Next() {
		var item model.WatchlistItem
		if err := rows.Scan(&item.ID, &item.UserID, &item.ContentKey, &item.Title, &item.PosterURL, &item.Metadata, &item.AddedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (r *SyncRepository) UpsertWatchlist(ctx context.Context, userID uuid.UUID, items []model.WatchlistItem) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `DELETE FROM watchlist_items WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}

	for _, item := range items {
		query := `
			INSERT INTO watchlist_items (id, user_id, content_key, title, poster_url, metadata, added_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`
		_, err := tx.Exec(ctx, query, item.ID, item.UserID, item.ContentKey, item.Title, item.PosterURL, item.Metadata, item.AddedAt)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *SyncRepository) GetHistory(ctx context.Context, userID uuid.UUID) ([]model.WatchHistoryItem, error) {
	query := `SELECT id, user_id, content_key, title, poster_url, progress, current_time, duration, metadata, watched_at FROM watch_history WHERE user_id = $1 ORDER BY watched_at DESC`
	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.WatchHistoryItem
	for rows.Next() {
		var item model.WatchHistoryItem
		if err := rows.Scan(&item.ID, &item.UserID, &item.ContentKey, &item.Title, &item.PosterURL, &item.Progress, &item.CurrentTime, &item.Duration, &item.Metadata, &item.WatchedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (r *SyncRepository) UpsertHistory(ctx context.Context, userID uuid.UUID, items []model.WatchHistoryItem) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `DELETE FROM watch_history WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}

	for _, item := range items {
		query := `
			INSERT INTO watch_history (id, user_id, content_key, title, poster_url, progress, current_time, duration, metadata, watched_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		`
		_, err := tx.Exec(ctx, query, item.ID, item.UserID, item.ContentKey, item.Title, item.PosterURL, item.Progress, item.CurrentTime, item.Duration, item.Metadata, item.WatchedAt)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}
