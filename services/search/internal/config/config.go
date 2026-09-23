package config

import (
	"os"
)

type Config struct {
	Port        string
	AppEnv      string
	LogLevel    string
	DatabaseURL string
	RedisURL    string
}

func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8004"
	}

	appEnv := os.Getenv("APP_ENV")
	if appEnv == "" {
		appEnv = "development"
	}

	logLevel := os.Getenv("LOG_LEVEL")
	if logLevel == "" {
		logLevel = "info"
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://streamforge:streamforge_dev_password@localhost:5432/content_db?sslmode=disable"
	}
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/3"
	}

	return &Config{
		Port:        port,
		AppEnv:      appEnv,
		LogLevel:    logLevel,
		DatabaseURL: databaseURL,
		RedisURL:    redisURL,
	}
}
