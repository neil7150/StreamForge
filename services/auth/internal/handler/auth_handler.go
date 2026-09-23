// Package handler provides HTTP handlers for the auth service.
package handler

import (
	"errors"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"streamforge.local/pkg/auth"
	"streamforge.local/pkg/response"
	"streamforge/services/auth/internal/dto"
	"streamforge/services/auth/internal/repository"
	"streamforge/services/auth/internal/service"
)

// AuthHandler handles HTTP requests for authentication endpoints.
type AuthHandler struct {
	authService *service.AuthService
	validate    *validator.Validate
	logger      zerolog.Logger
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(authService *service.AuthService, logger zerolog.Logger) *AuthHandler {
	return &AuthHandler{
		authService: authService,
		validate:    validator.New(),
		logger:      logger.With().Str("component", "auth_handler").Logger(),
	}
}

// Register handles POST /auth/register.
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req dto.RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		h.logger.Warn().Err(err).Msg("invalid register request body")
		return response.BadRequest(c, "Invalid request body")
	}

	if err := h.validate.Struct(req); err != nil {
		h.logger.Warn().Err(err).Msg("register validation failed")
		return response.BadRequest(c, formatValidationErrors(err))
	}

	resp, err := h.authService.Register(c.Context(), req)
	if err != nil {
		if errors.Is(err, repository.ErrDuplicateEmail) {
			return response.Conflict(c, "An account with this email already exists")
		}
		h.logger.Error().Err(err).Msg("register failed")
		return response.InternalError(c, "Failed to create account")
	}

	return response.Created(c, resp)
}

// Login handles POST /auth/login.
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req dto.LoginRequest
	if err := c.BodyParser(&req); err != nil {
		h.logger.Warn().Err(err).Msg("invalid login request body")
		return response.BadRequest(c, "Invalid request body")
	}

	if err := h.validate.Struct(req); err != nil {
		h.logger.Warn().Err(err).Msg("login validation failed")
		return response.BadRequest(c, formatValidationErrors(err))
	}

	resp, err := h.authService.Login(c.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidCredentials):
			return response.Unauthorized(c, "Invalid email or password")
		case errors.Is(err, service.ErrAccountLocked):
			return response.TooManyRequests(c, "Account is temporarily locked. Please try again later")
		case errors.Is(err, service.ErrAccountInactive):
			return response.Forbidden(c, "Account is inactive")
		default:
			h.logger.Error().Err(err).Msg("login failed")
			return response.InternalError(c, "Login failed")
		}
	}

	return response.OK(c, resp)
}

// Refresh handles POST /auth/refresh.
func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	var req dto.RefreshRequest
	if err := c.BodyParser(&req); err != nil {
		h.logger.Warn().Err(err).Msg("invalid refresh request body")
		return response.BadRequest(c, "Invalid request body")
	}

	if err := h.validate.Struct(req); err != nil {
		h.logger.Warn().Err(err).Msg("refresh validation failed")
		return response.BadRequest(c, formatValidationErrors(err))
	}

	resp, err := h.authService.RefreshToken(c.Context(), req.RefreshToken)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidToken):
			return response.Unauthorized(c, "Invalid or expired refresh token")
		case errors.Is(err, service.ErrAccountInactive):
			return response.Forbidden(c, "Account is inactive")
		default:
			h.logger.Error().Err(err).Msg("refresh failed")
			return response.InternalError(c, "Token refresh failed")
		}
	}

	return response.OK(c, resp)
}

// Logout handles POST /auth/logout (requires authentication).
func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	// Get the JWT ID from the authenticated claims
	claims, ok := c.Locals("claims").(*auth.Claims)
	if !ok {
		return response.Unauthorized(c, "Invalid authentication")
	}

	// Parse optional refresh token from request body
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	_ = c.BodyParser(&req)

	if err := h.authService.Logout(c.Context(), req.RefreshToken, claims.ID); err != nil {
		h.logger.Error().Err(err).Msg("logout failed")
		return response.InternalError(c, "Logout failed")
	}

	return response.OK(c, fiber.Map{"message": "Logged out successfully"})
}

// Me handles GET /auth/me (requires authentication).
func (h *AuthHandler) Me(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return response.Unauthorized(c, "Invalid authentication")
	}

	resp, err := h.authService.GetCurrentUser(c.Context(), userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return response.NotFound(c, "User not found")
		}
		h.logger.Error().Err(err).Msg("get current user failed")
		return response.InternalError(c, "Failed to fetch user profile")
	}

	return response.OK(c, resp)
}

// RequestVerification handles POST /auth/verify-email/request (requires authentication).
func (h *AuthHandler) RequestVerification(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return response.Unauthorized(c, "Invalid authentication")
	}

	token, err := h.authService.RequestEmailVerification(c.Context(), userID)
	if err != nil {
		if errors.Is(err, service.ErrEmailAlreadyVerified) {
			return response.Conflict(c, "Email is already verified")
		}
		if errors.Is(err, repository.ErrUserNotFound) {
			return response.NotFound(c, "User not found")
		}
		h.logger.Error().Err(err).Msg("request verification failed")
		return response.InternalError(c, "Failed to generate verification token")
	}

	return response.OK(c, fiber.Map{
		"verification_token": token,
		"message":            "Verification token generated. In production, this would be sent to your email.",
	})
}

// VerifyEmail handles POST /auth/verify-email.
func (h *AuthHandler) VerifyEmail(c *fiber.Ctx) error {
	var req dto.VerifyEmailRequest
	if err := c.BodyParser(&req); err != nil {
		h.logger.Warn().Err(err).Msg("invalid verify email request body")
		return response.BadRequest(c, "Invalid request body")
	}

	if err := h.validate.Struct(req); err != nil {
		h.logger.Warn().Err(err).Msg("verify email validation failed")
		return response.BadRequest(c, formatValidationErrors(err))
	}

	if err := h.authService.VerifyEmail(c.Context(), req.Token); err != nil {
		if errors.Is(err, service.ErrInvalidVerificationToken) {
			return response.BadRequest(c, "Invalid or expired verification token")
		}
		h.logger.Error().Err(err).Msg("verify email failed")
		return response.InternalError(c, "Failed to verify email")
	}

	return response.OK(c, fiber.Map{
		"message": "Email verified successfully",
	})
}

// formatValidationErrors converts validator errors to a human-readable message.
func formatValidationErrors(err error) string {
	var validationErrors validator.ValidationErrors
	if errors.As(err, &validationErrors) {
		messages := make([]string, 0, len(validationErrors))
		for _, e := range validationErrors {
			var msg string
			switch e.Tag() {
			case "required":
				msg = e.Field() + " is required"
			case "email":
				msg = e.Field() + " must be a valid email address"
			case "min":
				msg = e.Field() + " must be at least " + e.Param() + " characters"
			case "max":
				msg = e.Field() + " must be at most " + e.Param() + " characters"
			default:
				msg = e.Field() + " failed validation: " + e.Tag()
			}
			messages = append(messages, msg)
		}
		if len(messages) > 0 {
			result := messages[0]
			for i := 1; i < len(messages); i++ {
				result += "; " + messages[i]
			}
			return result
		}
	}
	return "Validation failed"
}
