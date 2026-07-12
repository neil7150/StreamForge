// Package model defines the domain models for the auth service.
package model

import (
	"time"

	"github.com/google/uuid"
)

// User represents a row in the users table.
type User struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	Email          string     `json:"email" db:"email"`
	PasswordHash   string     `json:"-" db:"password_hash"`
	EmailVerified  bool       `json:"email_verified" db:"email_verified"`
	IsActive       bool       `json:"is_active" db:"is_active"`
	Role           string     `json:"role" db:"role"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" db:"updated_at"`
	LastLoginAt    *time.Time `json:"last_login_at,omitempty" db:"last_login_at"`
	FailedAttempts int        `json:"-" db:"failed_attempts"`
	LockedUntil    *time.Time `json:"-" db:"locked_until"`
}

// IsLocked returns true if the account is currently locked.
func (u *User) IsLocked() bool {
	if u.LockedUntil == nil {
		return false
	}
	return time.Now().Before(*u.LockedUntil)
}

// OAuthProvider represents a row in the oauth_providers table.
type OAuthProvider struct {
	ID           uuid.UUID `json:"id" db:"id"`
	UserID       uuid.UUID `json:"user_id" db:"user_id"`
	Provider     string    `json:"provider" db:"provider"`
	ProviderID   string    `json:"provider_id" db:"provider_id"`
	AccessToken  string    `json:"-" db:"access_token"`
	RefreshToken string    `json:"-" db:"refresh_token"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

// RefreshToken represents a row in the refresh_tokens table.
type RefreshToken struct {
	ID         uuid.UUID  `json:"id" db:"id"`
	UserID     uuid.UUID  `json:"user_id" db:"user_id"`
	TokenHash  string     `json:"-" db:"token_hash"`
	DeviceInfo *string    `json:"device_info,omitempty" db:"device_info"`
	ExpiresAt  time.Time  `json:"expires_at" db:"expires_at"`
	CreatedAt  time.Time  `json:"created_at" db:"created_at"`
	RevokedAt  *time.Time `json:"revoked_at,omitempty" db:"revoked_at"`
}
