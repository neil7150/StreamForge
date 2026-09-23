package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/rs/zerolog"

	"streamforge.local/pkg/auth"
	"streamforge/services/auth/internal/config"
	"streamforge/services/auth/internal/dto"
	"streamforge/services/auth/internal/model"
	"streamforge/services/auth/internal/repository"
)

var (
	ErrUnsupportedOAuthProvider = errors.New("unsupported oauth provider")
	ErrOAuthCodeExchangeFailed  = errors.New("oauth code exchange failed")
	ErrOAuthFetchUserInfoFailed = errors.New("failed to fetch oauth user info")
	ErrOAuthEmailNotProvided    = errors.New("oauth provider did not return a verified email")
)

type OAuthUserInfo struct {
	ProviderID string
	Email      string
}

type OAuthService struct {
	cfg        config.Config
	userRepo   *repository.UserRepository
	oauthRepo  *repository.OAuthRepository
	tokenRepo  *repository.TokenRepository
	jwtCfg     auth.JWTConfig
	httpClient *http.Client
	logger     zerolog.Logger
}

func NewOAuthService(
	cfg config.Config,
	userRepo *repository.UserRepository,
	oauthRepo *repository.OAuthRepository,
	tokenRepo *repository.TokenRepository,
	jwtCfg auth.JWTConfig,
	logger zerolog.Logger,
) *OAuthService {
	return &OAuthService{
		cfg:        cfg,
		userRepo:   userRepo,
		oauthRepo:  oauthRepo,
		tokenRepo:  tokenRepo,
		jwtCfg:     jwtCfg,
		httpClient: &http.Client{Timeout: 10 * time.Second},
		logger:     logger.With().Str("component", "oauth_service").Logger(),
	}
}

// GetAuthURL generates the provider's authorization redirect URL.
func (s *OAuthService) GetAuthURL(provider, state, redirectURI string) (string, error) {
	switch provider {
	case "google":
		if s.cfg.GoogleClientID == "" {
			return "", errors.New("google oauth client ID not configured")
		}
		params := url.Values{
			"client_id":     {s.cfg.GoogleClientID},
			"redirect_uri":  {redirectURI},
			"response_type": {"code"},
			"scope":         {"openid email profile"},
			"access_type":   {"offline"},
			"prompt":        {"select_account"},
			"state":         {state},
		}
		return "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode(), nil

	case "github":
		if s.cfg.GithubClientID == "" {
			return "", errors.New("github oauth client ID not configured")
		}
		params := url.Values{
			"client_id":    {s.cfg.GithubClientID},
			"redirect_uri": {redirectURI},
			"scope":        {"user:email"},
			"state":        {state},
		}
		return "https://github.com/login/oauth/authorize?" + params.Encode(), nil

	default:
		return "", ErrUnsupportedOAuthProvider
	}
}

// HandleCallback exchanges authorization code, retrieves user info, links or creates user, and returns tokens.
func (s *OAuthService) HandleCallback(ctx context.Context, provider, code, redirectURI string) (*dto.AuthResponse, error) {
	s.logger.Info().Str("provider", provider).Msg("processing oauth callback")

	var (
		userInfo     *OAuthUserInfo
		accessToken  string
		refreshToken string
		err          error
	)

	switch provider {
	case "google":
		userInfo, accessToken, refreshToken, err = s.exchangeGoogle(ctx, code, redirectURI)
	case "github":
		userInfo, accessToken, refreshToken, err = s.exchangeGitHub(ctx, code, redirectURI)
	default:
		return nil, ErrUnsupportedOAuthProvider
	}

	if err != nil {
		s.logger.Error().Err(err).Str("provider", provider).Msg("oauth exchange failed")
		return nil, err
	}

	if userInfo.Email == "" {
		return nil, ErrOAuthEmailNotProvided
	}

	// 1. Check if OAuth link exists
	oauthRecord, err := s.oauthRepo.GetByProviderAndID(ctx, provider, userInfo.ProviderID)
	var user *model.User

	if err == nil && oauthRecord != nil {
		// User already linked with this OAuth provider
		user, err = s.userRepo.GetByID(ctx, oauthRecord.UserID)
		if err != nil {
			return nil, fmt.Errorf("get linked user: %w", err)
		}
	} else {
		// 2. Check if user exists by email
		user, err = s.userRepo.GetByEmail(ctx, userInfo.Email)
		if err != nil {
			if errors.Is(err, repository.ErrUserNotFound) {
				// 3. Create new user with random strong password
				randomPassBytes := make([]byte, 32)
				_, _ = rand.Read(randomPassBytes)
				passwordHash, _ := hashPassword(hex.EncodeToString(randomPassBytes))

				user, err = s.userRepo.CreateUser(ctx, userInfo.Email, passwordHash)
				if err != nil {
					return nil, fmt.Errorf("create user from oauth: %w", err)
				}
				_ = s.userRepo.MarkEmailVerified(ctx, user.ID)
				user.EmailVerified = true
			} else {
				return nil, fmt.Errorf("check user by email: %w", err)
			}
		}

		// Create the OAuth provider link
		newLink := &model.OAuthProvider{
			UserID:       user.ID,
			Provider:     provider,
			ProviderID:   userInfo.ProviderID,
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
		}
		if err := s.oauthRepo.CreateOAuthProvider(ctx, newLink); err != nil {
			s.logger.Warn().Err(err).Msg("failed to record oauth provider link")
		}
	}

	if !user.IsActive {
		return nil, ErrAccountInactive
	}

	_ = s.userRepo.UpdateLastLogin(ctx, user.ID)

	// Generate standard auth tokens
	authResp, err := s.generateAuthResponse(ctx, user)
	if err != nil {
		return nil, err
	}

	s.logger.Info().Str("user_id", user.ID.String()).Str("provider", provider).Msg("oauth login successful")
	return authResp, nil
}

func (s *OAuthService) exchangeGoogle(ctx context.Context, code, redirectURI string) (*OAuthUserInfo, string, string, error) {
	data := url.Values{
		"code":          {code},
		"client_id":     {s.cfg.GoogleClientID},
		"client_secret": {s.cfg.GoogleClientSecret},
		"redirect_uri":  {redirectURI},
		"grant_type":    {"authorization_code"},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", bytes.NewBufferString(data.Encode()))
	if err != nil {
		return nil, "", "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := s.httpClient.Do(req)
	if err != nil {
		return nil, "", "", fmt.Errorf("google token request: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		return nil, "", "", fmt.Errorf("google token endpoint returned %d: %s", res.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		IDToken      string `json:"id_token"`
	}
	if err := json.NewDecoder(res.Body).Decode(&tokenResp); err != nil {
		return nil, "", "", err
	}

	// Fetch userinfo
	infoReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	if err != nil {
		return nil, "", "", err
	}
	infoReq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)

	infoRes, err := s.httpClient.Do(infoReq)
	if err != nil {
		return nil, "", "", fmt.Errorf("google userinfo request: %w", err)
	}
	defer infoRes.Body.Close()

	var googleUser struct {
		ID            string `json:"id"`
		Email         string `json:"email"`
		VerifiedEmail bool   `json:"verified_email"`
	}
	if err := json.NewDecoder(infoRes.Body).Decode(&googleUser); err != nil {
		return nil, "", "", err
	}

	return &OAuthUserInfo{
		ProviderID: googleUser.ID,
		Email:      googleUser.Email,
	}, tokenResp.AccessToken, tokenResp.RefreshToken, nil
}

func (s *OAuthService) exchangeGitHub(ctx context.Context, code, redirectURI string) (*OAuthUserInfo, string, string, error) {
	data := url.Values{
		"code":          {code},
		"client_id":     {s.cfg.GithubClientID},
		"client_secret": {s.cfg.GithubClientSecret},
		"redirect_uri":  {redirectURI},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://github.com/login/oauth/access_token", bytes.NewBufferString(data.Encode()))
	if err != nil {
		return nil, "", "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := s.httpClient.Do(req)
	if err != nil {
		return nil, "", "", fmt.Errorf("github token request: %w", err)
	}
	defer res.Body.Close()

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		Scope        string `json:"scope"`
	}
	if err := json.NewDecoder(res.Body).Decode(&tokenResp); err != nil {
		return nil, "", "", err
	}

	if tokenResp.AccessToken == "" {
		return nil, "", "", errors.New("empty access token from github")
	}

	// Fetch user details
	userReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return nil, "", "", err
	}
	userReq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)
	userReq.Header.Set("User-Agent", "StreamForge-Auth")

	userRes, err := s.httpClient.Do(userReq)
	if err != nil {
		return nil, "", "", fmt.Errorf("github user request: %w", err)
	}
	defer userRes.Body.Close()

	var ghUser struct {
		ID    int64  `json:"id"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(userRes.Body).Decode(&ghUser); err != nil {
		return nil, "", "", err
	}

	email := ghUser.Email
	if email == "" {
		// Fetch emails list
		emailsReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user/emails", nil)
		if err == nil {
			emailsReq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)
			emailsReq.Header.Set("User-Agent", "StreamForge-Auth")
			if emailsRes, err := s.httpClient.Do(emailsReq); err == nil {
				defer emailsRes.Body.Close()
				var emails []struct {
					Email    string `json:"email"`
					Primary  bool   `json:"primary"`
					Verified bool   `json:"verified"`
				}
				if json.NewDecoder(emailsRes.Body).Decode(&emails) == nil {
					for _, e := range emails {
						if e.Primary && e.Verified {
							email = e.Email
							break
						}
					}
					if email == "" && len(emails) > 0 {
						email = emails[0].Email
					}
				}
			}
		}
	}

	return &OAuthUserInfo{
		ProviderID: strconv.FormatInt(ghUser.ID, 10),
		Email:      email,
	}, tokenResp.AccessToken, tokenResp.RefreshToken, nil
}

func (s *OAuthService) generateAuthResponse(ctx context.Context, user *model.User) (*dto.AuthResponse, error) {
	accessToken, err := auth.GenerateAccessToken(s.jwtCfg, user.ID, user.Email, user.Role)
	if err != nil {
		return nil, fmt.Errorf("generate access token: %w", err)
	}

	rawRefreshToken := auth.GenerateRefreshToken()
	tokenHash := hashRefreshToken(rawRefreshToken)

	if err := s.tokenRepo.StoreRefreshToken(ctx, user.ID, tokenHash, s.jwtCfg.RefreshTTL); err != nil {
		return nil, fmt.Errorf("store refresh token: %w", err)
	}

	return &dto.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: rawRefreshToken,
		ExpiresIn:    int(s.jwtCfg.AccessTTL.Seconds()),
		User:         dto.ToUserResponse(user),
	}, nil
}
