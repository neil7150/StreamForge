package config

import (
	"os"
)

type Config struct {
	Port         string
	AppEnv       string
	LogLevel     string
	DatabaseURL  string
	RedisURL     string
	AuthRedisURL string
	JWTSecret    string
}

func Load() *Config {
	return &Config{
		Port:         getEnvOrDefault("PORT", "8003"),
		AppEnv:       getEnvOrDefault("APP_ENV", "development"),
		LogLevel:     getEnvOrDefault("LOG_LEVEL", "debug"),
		DatabaseURL:  getEnvOrDefault("DATABASE_URL", "postgres://streamforge:streamforge_dev_password@localhost:5432/user_db?sslmode=disable"),
		RedisURL:     getEnvOrDefault("REDIS_URL", "redis://localhost:6379/2"),
		AuthRedisURL: getEnvOrDefault("AUTH_REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret:    getEnvOrDefault("JWT_SECRET", "your-super-secret-jwt-key-change-in-production"),
	}
}

func getEnvOrDefault(key, fallback string) string {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	return val
}
