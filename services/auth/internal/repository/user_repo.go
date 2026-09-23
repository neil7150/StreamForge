// Package repository provides data access layer for the auth service.
package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"streamforge/services/auth/internal/model"
)

// ErrUserNotFound is returned when a user is not found.
var ErrUserNotFound = errors.New("user not found")

// ErrDuplicateEmail is returned when a user with the email already exists.
var ErrDuplicateEmail = errors.New("email already registered")

// UserRepository handles user persistence operations.
type UserRepository struct {
	pool *pgxpool.Pool
}

// NewUserRepository creates a new UserRepository.
func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// CreateUser inserts a new user and returns the created user.
func (r *UserRepository) CreateUser(ctx context.Context, email, passwordHash string) (*model.User, error) {
	user := &model.User{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash)
		 VALUES ($1, $2)
		 RETURNING id, email, password_hash, email_verified, is_active, role,
		           created_at, updated_at, last_login_at, failed_attempts, locked_until`,
		email, passwordHash,
	).Scan(
		&user.ID, &user.Email, &user.PasswordHash,
		&user.EmailVerified, &user.IsActive, &user.Role,
		&user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt,
		&user.FailedAttempts, &user.LockedUntil,
	)
	if err != nil {
		if isDuplicateKeyError(err) {
			return nil, ErrDuplicateEmail
		}
		return nil, fmt.Errorf("create user: %w", err)
	}
	return user, nil
}

// GetByEmail fetches a user by email address.
func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	user := &model.User{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, email_verified, is_active, role,
		        created_at, updated_at, last_login_at, failed_attempts, locked_until
		 FROM users WHERE email = $1`,
		email,
	).Scan(
		&user.ID, &user.Email, &user.PasswordHash,
		&user.EmailVerified, &user.IsActive, &user.Role,
		&user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt,
		&user.FailedAttempts, &user.LockedUntil,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return user, nil
}

// GetByID fetches a user by UUID.
func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	user := &model.User{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, email_verified, is_active, role,
		        created_at, updated_at, last_login_at, failed_attempts, locked_until
		 FROM users WHERE id = $1`,
		id,
	).Scan(
		&user.ID, &user.Email, &user.PasswordHash,
		&user.EmailVerified, &user.IsActive, &user.Role,
		&user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt,
		&user.FailedAttempts, &user.LockedUntil,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return user, nil
}

// UpdateLastLogin sets the last_login_at timestamp for a user.
func (r *UserRepository) UpdateLastLogin(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
		id,
	)
	if err != nil {
		return fmt.Errorf("update last login: %w", err)
	}
	return nil
}

// IncrementFailedAttempts increments the failed login attempt counter.
func (r *UserRepository) IncrementFailedAttempts(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET failed_attempts = failed_attempts + 1, updated_at = NOW() WHERE id = $1`,
		id,
	)
	if err != nil {
		return fmt.Errorf("increment failed attempts: %w", err)
	}
	return nil
}

// ResetFailedAttempts resets the failed login attempt counter to 0.
func (r *UserRepository) ResetFailedAttempts(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`,
		id,
	)
	if err != nil {
		return fmt.Errorf("reset failed attempts: %w", err)
	}
	return nil
}

// LockAccount locks a user account until the specified time.
func (r *UserRepository) LockAccount(ctx context.Context, id uuid.UUID, until time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET locked_until = $2, updated_at = NOW() WHERE id = $1`,
		id, until,
	)
	if err != nil {
		return fmt.Errorf("lock account: %w", err)
	}
	return nil
}

// MarkEmailVerified updates the email_verified flag to true for a user.
func (r *UserRepository) MarkEmailVerified(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1`,
		id,
	)
	if err != nil {
		return fmt.Errorf("mark email verified: %w", err)
	}
	return nil
}

// isDuplicateKeyError checks if the error is a PostgreSQL unique violation (23505).
func isDuplicateKeyError(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
