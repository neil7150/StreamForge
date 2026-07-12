// Package config provides configuration management for the auth service.
package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds all configuration for the auth service.
type Config struct {
	Port        string
	DatabaseURL string
	RedisURL    string
	JWTSecret   string
	AccessTTL   time.Duration
	RefreshTTL  time.Duration
	AppEnv      string
	LogLevel    string
}

// Load reads configuration from environment variables with defaults.
func Load() Config {
	return Config{
		Port:        getEnv("PORT", "8081"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://streamforge:streamforge@localhost:5432/auth?sslmode=disable"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret:   getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		AccessTTL:   parseDuration(getEnv("JWT_ACCESS_TTL", "15m")),
		RefreshTTL:  parseDuration(getEnv("JWT_REFRESH_TTL", "168h")),
		AppEnv:      getEnv("APP_ENV", "development"),
		LogLevel:    getEnv("LOG_LEVEL", "debug"),
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
