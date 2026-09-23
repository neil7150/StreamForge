// Package config provides configuration for the Content service.
package config

import (
	"os"
	"strings"
)

// Config holds all configuration for the content service.
type Config struct {
	Port           string
	DatabaseURL    string
	RedisURL       string
	AuthRedisURL   string
	JWTSecret      string
	MinioEndpoint  string
	MinioAccessKey string
	MinioSecretKey string
	AppEnv         string
	LogLevel       string
}

// Load reads configuration from environment variables with defaults.
func Load() Config {
	return Config{
		Port:           getEnv("PORT", "8002"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://streamforge:streamforge_dev_password@localhost:5432/content_db?sslmode=disable"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379/1"),
		AuthRedisURL:   getEnv("AUTH_REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret:      getEnv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production"),
		MinioEndpoint:  getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinioAccessKey: getEnv("MINIO_ACCESS_KEY", "streamforge"),
		MinioSecretKey: getEnv("MINIO_SECRET_KEY", "streamforge_minio_password"),
		AppEnv:         getEnv("APP_ENV", "development"),
		LogLevel:       getEnv("LOG_LEVEL", "info"),
	}
}

// IsDevelopment returns true if the app is running in development mode.
func (c Config) IsDevelopment() bool {
	return strings.ToLower(c.AppEnv) == "development"
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
