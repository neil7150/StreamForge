package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"streamforge.local/pkg/response"
	"streamforge/services/user/internal/dto"
	"streamforge/services/user/internal/model"
	"streamforge/services/user/internal/service"
)

type ProfileHandler struct {
	service *service.ProfileService
}

func NewProfileHandler(s *service.ProfileService) *ProfileHandler {
	return &ProfileHandler{service: s}
}

func (h *ProfileHandler) GetProfile(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return response.Unauthorized(c, "Invalid user ID")
	}

	profile, err := h.service.GetProfile(c.Context(), userID)
	if err != nil {
		return response.InternalError(c, "Failed to get profile")
	}
	if profile == nil {
		return response.NotFound(c, "Profile not found")
	}

	return response.OK(c, dto.ToProfileResponse(profile))
}

func (h *ProfileHandler) UpdateProfile(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return response.Unauthorized(c, "Invalid user ID")
	}

	var req dto.UpdateProfileRequest
	if err := c.BodyParser(&req); err != nil {
		return response.BadRequest(c, "Invalid request body")
	}

	profile := model.UserProfile{
		UserID:      userID,
		DisplayName: req.DisplayName,
		AvatarURL:   req.AvatarURL,
		Preferences: req.Preferences,
	}

	if err := h.service.UpdateProfile(c.Context(), profile); err != nil {
		return response.InternalError(c, "Failed to update profile")
	}

	return response.OK(c, fiber.Map{"status": "success"})
}
