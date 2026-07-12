package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"streamforge/services/content/internal/model"
)

// MagnetRepository handles database operations for magnet links.
type MagnetRepository struct {
	db *pgxpool.Pool
}

// NewMagnetRepository creates a new MagnetRepository.
func NewMagnetRepository(db *pgxpool.Pool) *MagnetRepository {
	return &MagnetRepository{db: db}
}

// magnetColumns is the set of columns to select for a magnet link.
const magnetColumns = `id, content_type, content_id, magnet_uri, info_hash, quality,
	codec, file_size_bytes, seed_count, peer_count, verified, source, last_checked_at, created_at`

// GetByContent returns all magnet links for a given content type and ID.
func (r *MagnetRepository) GetByContent(ctx context.Context, contentType string, contentID uuid.UUID) ([]model.MagnetLink, error) {
	query := fmt.Sprintf(`SELECT %s FROM magnet_links
		WHERE content_type = $1 AND content_id = $2
		ORDER BY quality, created_at DESC`, magnetColumns)

	rows, err := r.db.Query(ctx, query, contentType, contentID)
	if err != nil {
		return nil, fmt.Errorf("get magnets by content: %w", err)
	}
	defer rows.Close()

	var magnets []model.MagnetLink
	for rows.Next() {
		var ml model.MagnetLink
		if err := rows.Scan(
			&ml.ID, &ml.ContentType, &ml.ContentID, &ml.MagnetURI, &ml.InfoHash, &ml.Quality,
			&ml.Codec, &ml.FileSizeBytes, &ml.SeedCount, &ml.PeerCount, &ml.Verified,
			&ml.Source, &ml.LastCheckedAt, &ml.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan magnet: %w", err)
		}
		magnets = append(magnets, ml)
	}
	return magnets, rows.Err()
}

// Create inserts a new magnet link and returns it.
func (r *MagnetRepository) Create(ctx context.Context, ml model.MagnetLink) (model.MagnetLink, error) {
	query := fmt.Sprintf(`INSERT INTO magnet_links (content_type, content_id, magnet_uri, info_hash, quality, codec, file_size_bytes, source)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING %s`, magnetColumns)

	var created model.MagnetLink
	err := r.db.QueryRow(ctx, query,
		ml.ContentType, ml.ContentID, ml.MagnetURI, ml.InfoHash, ml.Quality,
		ml.Codec, ml.FileSizeBytes, ml.Source,
	).Scan(
		&created.ID, &created.ContentType, &created.ContentID, &created.MagnetURI, &created.InfoHash,
		&created.Quality, &created.Codec, &created.FileSizeBytes, &created.SeedCount, &created.PeerCount,
		&created.Verified, &created.Source, &created.LastCheckedAt, &created.CreatedAt,
	)
	if err != nil {
		return created, fmt.Errorf("create magnet: %w", err)
	}
	return created, nil
}

// Delete removes a magnet link by ID.
func (r *MagnetRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result, err := r.db.Exec(ctx, "DELETE FROM magnet_links WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("delete magnet: %w", err)
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
