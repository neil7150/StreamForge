// Package service provides the business logic for the auth service.
package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"golang.org/x/crypto/argon2"

	"streamforge.local/pkg/auth"
	"streamforge/services/auth/internal/dto"
	"streamforge/services/auth/internal/model"
	"streamforge/services/auth/internal/repository"
)

const (
	// Argon2id parameters
	argonTime    = 1
	argonMemory  = 64 * 1024
	argonThreads = 4
	argonKeyLen  = 32
	argonSaltLen = 16

	// Account lockout settings
	maxFailedAttempts = 5
	lockoutDuration   = 15 * time.Minute
)

// Common service errors.
var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrAccountLocked      = errors.New("account is temporarily locked due to too many failed attempts")
	ErrAccountInactive    = errors.New("account is inactive")
	ErrInvalidToken       = errors.New("invalid or expired refresh token")
)

// AuthService handles authentication business logic.
type AuthService struct {
	userRepo  *repository.UserRepository
	tokenRepo *repository.TokenRepository
	jwtCfg    auth.JWTConfig
	logger    zerolog.Logger
}

// NewAuthService creates a new AuthService.
func NewAuthService(
	userRepo *repository.UserRepository,
	tokenRepo *repository.TokenRepository,
	jwtCfg auth.JWTConfig,
	logger zerolog.Logger,
) *AuthService {
	return &AuthService{
		userRepo:  userRepo,
		tokenRepo: tokenRepo,
		jwtCfg:    jwtCfg,
		logger:    logger.With().Str("component", "auth_service").Logger(),
	}
}

// Register creates a new user account and returns an auth response.
func (s *AuthService) Register(ctx context.Context, req dto.RegisterRequest) (*dto.AuthResponse, error) {
	s.logger.Info().Str("email", req.Email).Msg("registering new user")

	// Hash the password with argon2id
	passwordHash, err := hashPassword(req.Password)
	if err != nil {
		s.logger.Error().Err(err).Msg("failed to hash password")
		return nil, fmt.Errorf("hash password: %w", err)
	}

	// Create the user in the database
	user, err := s.userRepo.CreateUser(ctx, req.Email, passwordHash)
	if err != nil {
		if errors.Is(err, repository.ErrDuplicateEmail) {
			s.logger.Warn().Str("email", req.Email).Msg("duplicate email registration attempt")
			return nil, repository.ErrDuplicateEmail
		}
		s.logger.Error().Err(err).Msg("failed to create user")
		return nil, fmt.Errorf("create user: %w", err)
	}

	// Generate tokens
	resp, err := s.generateAuthResponse(ctx, user)
	if err != nil {
		return nil, err
	}

	s.logger.Info().Str("user_id", user.ID.String()).Msg("user registered successfully")
	return resp, nil
}

// Login authenticates a user and returns an auth response.
func (s *AuthService) Login(ctx context.Context, req dto.LoginRequest) (*dto.AuthResponse, error) {
	s.logger.Info().Str("email", req.Email).Msg("login attempt")

	// Fetch user by email
	user, err := s.userRepo.GetByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			s.logger.Warn().Str("email", req.Email).Msg("login attempt for non-existent user")
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("get user: %w", err)
	}

	// Check if account is locked
	if user.IsLocked() {
		s.logger.Warn().Str("user_id", user.ID.String()).Msg("login attempt on locked account")
		return nil, ErrAccountLocked
	}

	// Check if account is active
	if !user.IsActive {
		s.logger.Warn().Str("user_id", user.ID.String()).Msg("login attempt on inactive account")
		return nil, ErrAccountInactive
	}

	// Verify password
	if !verifyPassword(req.Password, user.PasswordHash) {
		s.logger.Warn().Str("user_id", user.ID.String()).Int("failed_attempts", user.FailedAttempts+1).Msg("invalid password")

		// Increment failed attempts
		if err := s.userRepo.IncrementFailedAttempts(ctx, user.ID); err != nil {
			s.logger.Error().Err(err).Msg("failed to increment failed attempts")
		}

		// Lock account if threshold reached
		if user.FailedAttempts+1 >= maxFailedAttempts {
			lockUntil := time.Now().Add(lockoutDuration)
			if err := s.userRepo.LockAccount(ctx, user.ID, lockUntil); err != nil {
				s.logger.Error().Err(err).Msg("failed to lock account")
			}
			s.logger.Warn().Str("user_id", user.ID.String()).Time("locked_until", lockUntil).Msg("account locked due to too many failed attempts")
			return nil, ErrAccountLocked
		}

		return nil, ErrInvalidCredentials
	}

	// Reset failed attempts on successful login
	if user.FailedAttempts > 0 {
		if err := s.userRepo.ResetFailedAttempts(ctx, user.ID); err != nil {
			s.logger.Error().Err(err).Msg("failed to reset failed attempts")
		}
	}

	// Update last login timestamp
	if err := s.userRepo.UpdateLastLogin(ctx, user.ID); err != nil {
		s.logger.Error().Err(err).Msg("failed to update last login")
	}

	// Generate tokens
	resp, err := s.generateAuthResponse(ctx, user)
	if err != nil {
		return nil, err
	}

	s.logger.Info().Str("user_id", user.ID.String()).Msg("user logged in successfully")
	return resp, nil
}

// RefreshToken validates an existing refresh token and issues a new token pair.
func (s *AuthService) RefreshToken(ctx context.Context, refreshToken string) (*dto.AuthResponse, error) {
	s.logger.Info().Msg("refresh token request")

	// Hash the incoming refresh token
	tokenHash := hashRefreshToken(refreshToken)

	// Look up the token in Redis
	userID, err := s.tokenRepo.GetRefreshToken(ctx, tokenHash)
	if err != nil {
		s.logger.Warn().Msg("invalid refresh token presented")
		return nil, ErrInvalidToken
	}

	// Revoke the old refresh token (rotation)
	if err := s.tokenRepo.RevokeRefreshToken(ctx, tokenHash); err != nil {
		s.logger.Error().Err(err).Msg("failed to revoke old refresh token")
	}

	// Fetch the user to ensure they still exist and are active
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		s.logger.Error().Err(err).Str("user_id", userID.String()).Msg("user not found during refresh")
		return nil, ErrInvalidToken
	}

	if !user.IsActive {
		s.logger.Warn().Str("user_id", userID.String()).Msg("refresh attempt on inactive account")
		return nil, ErrAccountInactive
	}

	// Generate new token pair
	resp, err := s.generateAuthResponse(ctx, user)
	if err != nil {
		return nil, err
	}

	s.logger.Info().Str("user_id", userID.String()).Msg("tokens refreshed successfully")
	return resp, nil
}

// Logout revokes a refresh token and blacklists the current JWT.
func (s *AuthService) Logout(ctx context.Context, refreshToken, jwtID string) error {
	s.logger.Info().Str("jwt_id", jwtID).Msg("logout request")

	// Revoke the refresh token
	if refreshToken != "" {
		tokenHash := hashRefreshToken(refreshToken)
		if err := s.tokenRepo.RevokeRefreshToken(ctx, tokenHash); err != nil {
			s.logger.Error().Err(err).Msg("failed to revoke refresh token during logout")
		}
	}

	// Blacklist the JWT for its remaining lifetime
	if jwtID != "" {
		if err := s.tokenRepo.BlacklistJWT(ctx, jwtID, s.jwtCfg.AccessTTL); err != nil {
			s.logger.Error().Err(err).Msg("failed to blacklist JWT during logout")
			return fmt.Errorf("blacklist jwt: %w", err)
		}
	}

	s.logger.Info().Msg("user logged out successfully")
	return nil
}

// GetCurrentUser returns the user profile for the given user ID.
func (s *AuthService) GetCurrentUser(ctx context.Context, userID uuid.UUID) (*dto.UserResponse, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, repository.ErrUserNotFound
		}
		return nil, fmt.Errorf("get user: %w", err)
	}

	resp := dto.ToUserResponse(user)
	return &resp, nil
}

// generateAuthResponse creates access and refresh tokens and returns an AuthResponse.
func (s *AuthService) generateAuthResponse(ctx context.Context, user *model.User) (*dto.AuthResponse, error) {
	// Generate access token
	accessToken, err := auth.GenerateAccessToken(s.jwtCfg, user.ID, user.Email, user.Role)
	if err != nil {
		s.logger.Error().Err(err).Msg("failed to generate access token")
		return nil, fmt.Errorf("generate access token: %w", err)
	}

	// Generate refresh token
	rawRefreshToken := auth.GenerateRefreshToken()
	tokenHash := hashRefreshToken(rawRefreshToken)

	// Store refresh token in Redis
	if err := s.tokenRepo.StoreRefreshToken(ctx, user.ID, tokenHash, s.jwtCfg.RefreshTTL); err != nil {
		s.logger.Error().Err(err).Msg("failed to store refresh token")
		return nil, fmt.Errorf("store refresh token: %w", err)
	}

	return &dto.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: rawRefreshToken,
		ExpiresIn:    int(s.jwtCfg.AccessTTL.Seconds()),
		User:         dto.ToUserResponse(user),
	}, nil
}

// hashPassword hashes a password using argon2id.
func hashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)

	// Encode as: $argon2id$v=19$m=65536,t=1,p=4$<salt>$<hash>
	saltHex := hex.EncodeToString(salt)
	hashHex := hex.EncodeToString(hash)
	encoded := fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		argonMemory, argonTime, argonThreads, saltHex, hashHex)

	return encoded, nil
}

// verifyPassword verifies a password against an argon2id hash.
func verifyPassword(password, encoded string) bool {
	// Parse the encoded hash
	var memory uint32
	var time uint32
	var threads uint8
	var saltHex, hashHex string

	_, err := fmt.Sscanf(encoded, "$argon2id$v=19$m=%d,t=%d,p=%d$%s",
		&memory, &time, &threads, &saltHex)
	if err != nil {
		return false
	}

	// Split saltHex which contains "salt$hash"
	parts := splitOnce(saltHex, "$")
	if len(parts) != 2 {
		return false
	}
	saltHex = parts[0]
	hashHex = parts[1]

	salt, err := hex.DecodeString(saltHex)
	if err != nil {
		return false
	}

	expectedHash, err := hex.DecodeString(hashHex)
	if err != nil {
		return false
	}

	// Compute hash with same params
	computedHash := argon2.IDKey([]byte(password), salt, time, memory, threads, argonKeyLen)

	// Constant-time comparison
	return subtle.ConstantTimeCompare(computedHash, expectedHash) == 1
}

// hashRefreshToken hashes a refresh token with SHA-256.
func hashRefreshToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

// splitOnce splits s on the first occurrence of sep.
func splitOnce(s, sep string) []string {
	for i := 0; i < len(s); i++ {
		if i+len(sep) <= len(s) && s[i:i+len(sep)] == sep {
			return []string{s[:i], s[i+len(sep):]}
		}
	}
	return []string{s}
}
