package repository

import (
	"context"
	"streamforge/services/user/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/google/uuid"
)

type ProfileRepository struct {
	db *pgxpool.Pool
}

func NewProfileRepository(db *pgxpool.Pool) *ProfileRepository {
	return &ProfileRepository{db: db}
}

func (r *ProfileRepository) GetByUserID(ctx context.Context, userID uuid.UUID) (*model.UserProfile, error) {
	query := `SELECT user_id, display_name, avatar_url, preferences, created_at, updated_at FROM user_profiles WHERE user_id = $1`
	row := r.db.QueryRow(ctx, query, userID)

	var profile model.UserProfile
	err := row.Scan(&profile.UserID, &profile.DisplayName, &profile.AvatarURL, &profile.Preferences, &profile.CreatedAt, &profile.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &profile, nil
}

func (r *ProfileRepository) Upsert(ctx context.Context, profile model.UserProfile) error {
	query := `
		INSERT INTO user_profiles (user_id, display_name, avatar_url, preferences, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			display_name = EXCLUDED.display_name,
			avatar_url = EXCLUDED.avatar_url,
			preferences = EXCLUDED.preferences,
			updated_at = NOW()
	`
	_, err := r.db.Exec(ctx, query, profile.UserID, profile.DisplayName, profile.AvatarURL, profile.Preferences)
	return err
}
