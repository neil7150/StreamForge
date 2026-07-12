package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"streamforge/services/content/internal/model"
)

// SubtitleRepository handles database operations for subtitles.
type SubtitleRepository struct {
	db *pgxpool.Pool
}

// NewSubtitleRepository creates a new SubtitleRepository.
func NewSubtitleRepository(db *pgxpool.Pool) *SubtitleRepository {
	return &SubtitleRepository{db: db}
}

// GetByContent returns all subtitles for a given content type and ID.
func (r *SubtitleRepository) GetByContent(ctx context.Context, contentType string, contentID uuid.UUID) ([]model.Subtitle, error) {
	query := `SELECT id, content_type, content_id, language, language_name, subtitle_url, format, is_default, created_at
		FROM subtitles
		WHERE content_type = $1 AND content_id = $2
		ORDER BY is_default DESC, language_name`

	rows, err := r.db.Query(ctx, query, contentType, contentID)
	if err != nil {
		return nil, fmt.Errorf("get subtitles by content: %w", err)
	}
	defer rows.Close()

	var subs []model.Subtitle
	for rows.Next() {
		var s model.Subtitle
		if err := rows.Scan(
			&s.ID, &s.ContentType, &s.ContentID, &s.Language, &s.LanguageName,
			&s.SubtitleURL, &s.Format, &s.IsDefault, &s.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan subtitle: %w", err)
		}
		subs = append(subs, s)
	}
	return subs, rows.Err()
}
