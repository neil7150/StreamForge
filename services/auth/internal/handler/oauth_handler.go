package handler

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/url"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"

	"streamforge.local/pkg/response"
	"streamforge/services/auth/internal/service"
)

type OAuthHandler struct {
	oauthSvc    *service.OAuthService
	frontendURL string
	log         zerolog.Logger
}

func NewOAuthHandler(oauthSvc *service.OAuthService, frontendURL string, log zerolog.Logger) *OAuthHandler {
	return &OAuthHandler{
		oauthSvc:    oauthSvc,
		frontendURL: frontendURL,
		log:         log.With().Str("component", "oauth_handler").Logger(),
	}
}

// GetAuthURL returns the provider's authorization URL.
func (h *OAuthHandler) GetAuthURL(c *fiber.Ctx) error {
	provider := c.Params("provider")
	redirectURI := c.Query("redirect_uri")
	if redirectURI == "" {
		redirectURI = fmt.Sprintf("%s://%s/auth/oauth/%s/callback", c.Protocol(), c.Hostname(), provider)
	}

	stateBytes := make([]byte, 16)
	_, _ = rand.Read(stateBytes)
	state := hex.EncodeToString(stateBytes)

	authURL, err := h.oauthSvc.GetAuthURL(provider, state, redirectURI)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}

	if c.Query("redirect") == "true" {
		return c.Redirect(authURL, fiber.StatusTemporaryRedirect)
	}

	return response.OK(c, fiber.Map{
		"provider": provider,
		"auth_url": authURL,
		"state":    state,
	})
}

// Callback handles the browser redirect callback from the OAuth provider.
func (h *OAuthHandler) Callback(c *fiber.Ctx) error {
	provider := c.Params("provider")
	code := c.Query("code")
	if code == "" {
		return response.BadRequest(c, "Missing authorization code")
	}

	redirectURI := c.Query("redirect_uri")
	if redirectURI == "" {
		redirectURI = fmt.Sprintf("%s://%s/auth/oauth/%s/callback", c.Protocol(), c.Hostname(), provider)
	}

	authResp, err := h.oauthSvc.HandleCallback(c.Context(), provider, code, redirectURI)
	if err != nil {
		h.log.Error().Err(err).Str("provider", provider).Msg("oauth callback failed")
		if h.frontendURL != "" {
			errRedirect := fmt.Sprintf("%s/settings?error=%s", h.frontendURL, url.QueryEscape(err.Error()))
			return c.Redirect(errRedirect, fiber.StatusTemporaryRedirect)
		}
		return response.BadRequest(c, "OAuth authentication failed: "+err.Error())
	}

	// If accessed from browser redirect, redirect back to frontend settings with tokens
	if h.frontendURL != "" {
		successRedirect := fmt.Sprintf("%s/settings?access_token=%s&refresh_token=%s",
			h.frontendURL,
			url.QueryEscape(authResp.AccessToken),
			url.QueryEscape(authResp.RefreshToken),
		)
		return c.Redirect(successRedirect, fiber.StatusTemporaryRedirect)
	}

	return response.OK(c, authResp)
}

type OAuthExchangeRequest struct {
	Code        string `json:"code" validate:"required"`
	RedirectURI string `json:"redirect_uri"`
}

// Exchange exchanges a code received on client-side for JWT credentials.
func (h *OAuthHandler) Exchange(c *fiber.Ctx) error {
	provider := c.Params("provider")
	var req OAuthExchangeRequest
	if err := c.BodyParser(&req); err != nil || req.Code == "" {
		return response.BadRequest(c, "Valid authorization code is required")
	}

	authResp, err := h.oauthSvc.HandleCallback(c.Context(), provider, req.Code, req.RedirectURI)
	if err != nil {
		h.log.Error().Err(err).Str("provider", provider).Msg("oauth exchange failed")
		return response.BadRequest(c, "OAuth authentication failed: "+err.Error())
	}

	return response.OK(c, authResp)
}
