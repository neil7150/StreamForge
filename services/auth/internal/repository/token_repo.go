package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const (
	// Redis key prefixes
	refreshTokenPrefix = "auth:refresh:"
	userTokensPrefix   = "auth:user_tokens:"
	blacklistPrefix    = "auth:blacklist:"
	emailVerifyPrefix  = "auth:email_verify:"
)

// TokenRepository handles token persistence in Redis.
type TokenRepository struct {
	client *redis.Client
}

var ErrRefreshTokenNotFound = errors.New("refresh token not found or expired")

// NewTokenRepository creates a new TokenRepository.
func NewTokenRepository(client *redis.Client) *TokenRepository {
	return &TokenRepository{client: client}
}

// StoreRefreshToken stores a hashed refresh token in Redis mapped to a user ID.
func (r *TokenRepository) StoreRefreshToken(ctx context.Context, userID uuid.UUID, tokenHash string, ttl time.Duration) error {
	pipe := r.client.Pipeline()

	// Store token hash → user ID mapping
	pipe.Set(ctx, refreshTokenPrefix+tokenHash, userID.String(), ttl)

	// Add token hash to user's set of active tokens
	pipe.SAdd(ctx, userTokensPrefix+userID.String(), tokenHash)
	pipe.Expire(ctx, userTokensPrefix+userID.String(), ttl)

	_, err := pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("store refresh token: %w", err)
	}
	return nil
}

// ConsumeRefreshToken atomically removes a token and returns its owner. GETDEL
// (Redis 6.2+) prevents concurrent requests from rotating one token twice.
func (r *TokenRepository) ConsumeRefreshToken(ctx context.Context, tokenHash string) (uuid.UUID, error) {
	val, err := r.client.GetDel(ctx, refreshTokenPrefix+tokenHash).Result()
	if err != nil {
		if err == redis.Nil {
			return uuid.Nil, ErrRefreshTokenNotFound
		}
		return uuid.Nil, fmt.Errorf("consume refresh token: %w", err)
	}

	userID, err := uuid.Parse(val)
	if err != nil {
		return uuid.Nil, fmt.Errorf("parse user ID from token: %w", err)
	}
	if err := r.client.SRem(ctx, userTokensPrefix+userID.String(), tokenHash).Err(); err != nil {
		return uuid.Nil, fmt.Errorf("remove consumed token from account index: %w", err)
	}
	return userID, nil
}

// RevokeRefreshToken removes a specific refresh token.
func (r *TokenRepository) RevokeRefreshToken(ctx context.Context, tokenHash string) error {
	// Get the user ID first to clean up the user's token set
	val, err := r.client.Get(ctx, refreshTokenPrefix+tokenHash).Result()
	if err != nil && err != redis.Nil {
		return fmt.Errorf("get token for revocation: %w", err)
	}

	pipe := r.client.Pipeline()
	pipe.Del(ctx, refreshTokenPrefix+tokenHash)

	if val != "" {
		pipe.SRem(ctx, userTokensPrefix+val, tokenHash)
	}

	_, err = pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}
	return nil
}

// RevokeAllUserTokens removes all refresh tokens for a user.
func (r *TokenRepository) RevokeAllUserTokens(ctx context.Context, userID uuid.UUID) error {
	key := userTokensPrefix + userID.String()

	// Get all token hashes for this user
	tokens, err := r.client.SMembers(ctx, key).Result()
	if err != nil {
		return fmt.Errorf("get user tokens: %w", err)
	}

	if len(tokens) == 0 {
		return nil
	}

	pipe := r.client.Pipeline()
	for _, tokenHash := range tokens {
		pipe.Del(ctx, refreshTokenPrefix+tokenHash)
	}
	pipe.Del(ctx, key)

	_, err = pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("revoke all user tokens: %w", err)
	}
	return nil
}

// BlacklistJWT adds a JWT ID to the blacklist with a TTL matching the token's remaining lifetime.
func (r *TokenRepository) BlacklistJWT(ctx context.Context, jwtID string, ttl time.Duration) error {
	err := r.client.Set(ctx, blacklistPrefix+jwtID, "1", ttl).Err()
	if err != nil {
		return fmt.Errorf("blacklist jwt: %w", err)
	}
	return nil
}

// IsBlacklisted checks if a JWT ID is in the blacklist.
func (r *TokenRepository) IsBlacklisted(ctx context.Context, jwtID string) (bool, error) {
	exists, err := r.client.Exists(ctx, blacklistPrefix+jwtID).Result()
	if err != nil {
		return false, fmt.Errorf("check blacklist: %w", err)
	}
	return exists > 0, nil
}

// StoreVerificationToken stores an email verification token in Redis mapped to a user ID.
func (r *TokenRepository) StoreVerificationToken(ctx context.Context, token string, userID uuid.UUID, ttl time.Duration) error {
	err := r.client.Set(ctx, emailVerifyPrefix+token, userID.String(), ttl).Err()
	if err != nil {
		return fmt.Errorf("store verification token: %w", err)
	}
	return nil
}

// GetVerificationUserID retrieves the user ID associated with an email verification token.
func (r *TokenRepository) GetVerificationUserID(ctx context.Context, token string) (uuid.UUID, error) {
	val, err := r.client.Get(ctx, emailVerifyPrefix+token).Result()
	if err != nil {
		if err == redis.Nil {
			return uuid.Nil, fmt.Errorf("verification token not found or expired")
		}
		return uuid.Nil, fmt.Errorf("get verification token: %w", err)
	}

	userID, err := uuid.Parse(val)
	if err != nil {
		return uuid.Nil, fmt.Errorf("parse user ID from token: %w", err)
	}
	return userID, nil
}

// DeleteVerificationToken removes a used email verification token.
func (r *TokenRepository) DeleteVerificationToken(ctx context.Context, token string) error {
	return r.client.Del(ctx, emailVerifyPrefix+token).Err()
}
