package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"streamforge/services/auth/internal/model"
)

// ErrOAuthProviderNotFound is returned when an oauth provider record is not found.
var ErrOAuthProviderNotFound = errors.New("oauth provider not found")

// OAuthRepository handles persistence of OAuth linked accounts.
type OAuthRepository struct {
	pool *pgxpool.Pool
}

// NewOAuthRepository creates a new OAuthRepository.
func NewOAuthRepository(pool *pgxpool.Pool) *OAuthRepository {
	return &OAuthRepository{pool: pool}
}

// GetByProviderAndID retrieves an OAuth provider link by provider name and provider's user ID.
func (r *OAuthRepository) GetByProviderAndID(ctx context.Context, provider, providerID string) (*model.OAuthProvider, error) {
	op := &model.OAuthProvider{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, provider, provider_id, access_token, refresh_token, created_at
		 FROM oauth_providers
		 WHERE provider = $1 AND provider_id = $2`,
		provider, providerID,
	).Scan(
		&op.ID, &op.UserID, &op.Provider, &op.ProviderID,
		&op.AccessToken, &op.RefreshToken, &op.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrOAuthProviderNotFound
		}
		return nil, fmt.Errorf("get oauth provider: %w", err)
	}
	return op, nil
}

// CreateOAuthProvider inserts a new OAuth provider link for a user.
func (r *OAuthRepository) CreateOAuthProvider(ctx context.Context, op *model.OAuthProvider) error {
	return r.pool.QueryRow(ctx,
		`INSERT INTO oauth_providers (user_id, provider, provider_id, access_token, refresh_token)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, created_at`,
		op.UserID, op.Provider, op.ProviderID, op.AccessToken, op.RefreshToken,
	).Scan(&op.ID, &op.CreatedAt)
}

// GetByUserID retrieves all OAuth provider links for a user.
func (r *OAuthRepository) GetByUserID(ctx context.Context, userID uuid.UUID) ([]model.OAuthProvider, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, provider, provider_id, access_token, refresh_token, created_at
		 FROM oauth_providers
		 WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("query oauth providers: %w", err)
	}
	defer rows.Close()

	var list []model.OAuthProvider
	for rows.Next() {
		var op model.OAuthProvider
		if err := rows.Scan(&op.ID, &op.UserID, &op.Provider, &op.ProviderID, &op.AccessToken, &op.RefreshToken, &op.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan oauth provider: %w", err)
		}
		list = append(list, op)
	}
	return list, nil
}
