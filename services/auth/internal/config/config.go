// Package config provides configuration management for the auth service.
package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds all configuration for the auth service.
type Config struct {
	Port               string
	DatabaseURL        string
	RedisURL           string
	JWTSecret          string
	AccessTTL          time.Duration
	RefreshTTL         time.Duration
	AppEnv             string
	LogLevel           string
	SMTPHost           string
	SMTPPort           int
	SMTPUser           string
	SMTPPass           string
	SMTPFrom           string
	GoogleClientID     string
	GoogleClientSecret string
	GithubClientID     string
	GithubClientSecret string
	FrontendURL        string
}

// Load reads configuration from environment variables with defaults.
func Load() Config {
	smtpPort, _ := strconv.Atoi(getEnv("SMTP_PORT", "587"))
	return Config{
		Port:               getEnv("PORT", "8001"),
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://streamforge:streamforge_dev_password@localhost:5432/auth_db?sslmode=disable"),
		RedisURL:           getEnv("REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret:          getEnv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production"),
		AccessTTL:          parseDuration(getEnv("JWT_ACCESS_TTL", "30m")),
		RefreshTTL:         parseDuration(getEnv("JWT_REFRESH_TTL", "720h")),
		AppEnv:             getEnv("APP_ENV", "development"),
		LogLevel:           getEnv("LOG_LEVEL", "debug"),
		SMTPHost:           getEnv("SMTP_HOST", ""),
		SMTPPort:           smtpPort,
		SMTPUser:           getEnv("SMTP_USER", ""),
		SMTPPass:           getEnv("SMTP_PASS", ""),
		SMTPFrom:           getEnv("SMTP_FROM", "noreply@streamforge.local"),
		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		GithubClientID:     getEnv("GITHUB_CLIENT_ID", ""),
		GithubClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),
		FrontendURL:        getEnv("FRONTEND_URL", "http://localhost:5173"),
	}
}

// IsProd returns true if the app is running in production.
func (c Config) IsProd() bool {
	return c.AppEnv == "production"
}

// AccessTTLSeconds returns the access token TTL in seconds (useful for Redis).
func (c Config) AccessTTLSeconds() int {
	return int(c.AccessTTL.Seconds())
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func parseDuration(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		// Try parsing as seconds
		if secs, err := strconv.Atoi(s); err == nil {
			return time.Duration(secs) * time.Second
		}
		return 15 * time.Minute // safe default
	}
	return d
}
