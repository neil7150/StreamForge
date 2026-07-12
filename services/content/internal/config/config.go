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
		Port:           getEnv("PORT", "8082"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://streamforge:streamforge@localhost:5432/content?sslmode=disable"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379/1"),
		JWTSecret:      getEnv("JWT_SECRET", ""),
		MinioEndpoint:  getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinioAccessKey: getEnv("MINIO_ACCESS_KEY", ""),
		MinioSecretKey: getEnv("MINIO_SECRET_KEY", ""),
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
