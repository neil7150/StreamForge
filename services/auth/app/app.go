// Package app assembles the auth HTTP application for production and integration tests.
package app

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"streamforge.local/pkg/auth"
	"streamforge.local/pkg/middleware"
	"streamforge/services/auth/internal/config"
	"streamforge/services/auth/internal/handler"
	"streamforge/services/auth/internal/mailer"
	"streamforge/services/auth/internal/repository"
	"streamforge/services/auth/internal/service"
)

type Config = config.Config

func New(pool *pgxpool.Pool, redisClient *redis.Client, cfg Config, log zerolog.Logger) *fiber.App {
	userRepo := repository.NewUserRepository(pool)
	tokenRepo := repository.NewTokenRepository(redisClient)
	oauthRepo := repository.NewOAuthRepository(pool)
	appMailer := mailer.NewMailer(mailer.Config{Host: cfg.SMTPHost, Port: cfg.SMTPPort, User: cfg.SMTPUser, Pass: cfg.SMTPPass, From: cfg.SMTPFrom, AppEnv: cfg.AppEnv}, log)
	jwtCfg := auth.JWTConfig{Secret: cfg.JWTSecret, AccessTTL: cfg.AccessTTL, RefreshTTL: cfg.RefreshTTL, Issuer: "streamforge-auth"}
	authHandler := handler.NewAuthHandler(service.NewAuthService(userRepo, tokenRepo, appMailer, jwtCfg, log), log)
	oauthHandler := handler.NewOAuthHandler(service.NewOAuthService(cfg, userRepo, oauthRepo, tokenRepo, jwtCfg, log), cfg.FrontendURL, log)
	app := fiber.New(fiber.Config{AppName: "StreamForge Auth Service", ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 120 * time.Second, DisableStartupMessage: cfg.IsProd()})
	middleware.Setup(app, log)
	middleware.RegisterMetrics(app, "auth")
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "service": "auth", "time": time.Now().UTC()})
	})
	handler.SetupRoutes(app, authHandler, oauthHandler, cfg.JWTSecret, tokenRepo)
	return app
}
