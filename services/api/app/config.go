package app

import (
	"errors"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	authapp "streamforge/services/auth/app"
)

type Config struct {
	Port                                                                 string
	DatabaseURL, AuthRedisURL, CacheRedisURL                             string
	AuthRedisCAFile, CacheRedisCAFile                                    string
	AuthRedisPolicyMode, AuthRedisAttestedEndpoint, AuthRedisAttestation string
	Auth                                                                 authapp.Config
}

func LoadConfig() (Config, error) {
	value := func(key, fallback string) string {
		if v := os.Getenv(key); v != "" {
			return v
		}
		return fallback
	}
	cfg := Config{
		Port:        value("SERVER_PORT", value("PORT", "8080")),
		DatabaseURL: os.Getenv("DATABASE_URL"), AuthRedisURL: os.Getenv("AUTH_REDIS_URL"), CacheRedisURL: os.Getenv("CACHE_REDIS_URL"),
		AuthRedisCAFile: os.Getenv("AUTH_REDIS_CA_FILE"), CacheRedisCAFile: os.Getenv("CACHE_REDIS_CA_FILE"),
		AuthRedisPolicyMode: value("AUTH_REDIS_POLICY_MODE", "live"), AuthRedisAttestedEndpoint: os.Getenv("AUTH_REDIS_ATTESTED_ENDPOINT"), AuthRedisAttestation: os.Getenv("AUTH_REDIS_ATTESTATION"),
		Auth: authapp.Config{JWTSecret: os.Getenv("JWT_SECRET"), AppEnv: "production", LogLevel: "info",
			SMTPHost: os.Getenv("SMTP_HOST"), SMTPPort: 587, SMTPUser: os.Getenv("SMTP_USER"), SMTPPass: os.Getenv("SMTP_PASS"), SMTPFrom: value("SMTP_FROM", "noreply@streamforge.local"),
			FrontendURL: os.Getenv("FRONTEND_URL"), GoogleClientID: os.Getenv("GOOGLE_CLIENT_ID"), GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"), GithubClientID: os.Getenv("GITHUB_CLIENT_ID"), GithubClientSecret: os.Getenv("GITHUB_CLIENT_SECRET")},
	}
	port, err := strconv.Atoi(cfg.Port)
	if err != nil || port < 1 || port > 65535 {
		return cfg, errors.New("SERVER_PORT/PORT must be a valid TCP port")
	}
	if cfg.DatabaseURL == "" || cfg.AuthRedisURL == "" || cfg.CacheRedisURL == "" {
		return cfg, errors.New("DATABASE_URL, AUTH_REDIS_URL and CACHE_REDIS_URL are required")
	}
	if err := validateConnections(cfg); err != nil {
		return cfg, err
	}
	if err := validateAuthRedisPolicyMode(cfg); err != nil {
		return cfg, err
	}
	if len(cfg.Auth.JWTSecret) < 32 || strings.HasPrefix(cfg.Auth.JWTSecret, "REPLACE_") || strings.Contains(cfg.Auth.JWTSecret, "change-in-production") {
		return cfg, errors.New("JWT_SECRET requires a private random secret of at least 32 characters")
	}
	cfg.Auth.AccessTTL, err = time.ParseDuration(value("JWT_ACCESS_TTL", "30m"))
	if err != nil || cfg.Auth.AccessTTL <= 0 {
		return cfg, errors.New("invalid JWT_ACCESS_TTL")
	}
	cfg.Auth.RefreshTTL, err = time.ParseDuration(value("JWT_REFRESH_TTL", "720h"))
	if err != nil || cfg.Auth.RefreshTTL <= cfg.Auth.AccessTTL {
		return cfg, errors.New("JWT_REFRESH_TTL must exceed the access-token lifetime")
	}
	if input := os.Getenv("SMTP_PORT"); input != "" {
		cfg.Auth.SMTPPort, err = strconv.Atoi(input)
		if err != nil || cfg.Auth.SMTPPort < 1 || cfg.Auth.SMTPPort > 65535 {
			return cfg, errors.New("invalid SMTP_PORT")
		}
	}
	return cfg, nil
}

func validateConnections(cfg Config) error {
	loopback := func(host string) bool {
		ip := net.ParseIP(host)
		return strings.EqualFold(host, "localhost") || (ip != nil && ip.IsLoopback())
	}
	db, err := url.Parse(cfg.DatabaseURL)
	if err != nil || (db.Scheme != "postgres" && db.Scheme != "postgresql") || db.Hostname() == "" {
		return errors.New("invalid DATABASE_URL")
	}
	if !loopback(db.Hostname()) && db.Query().Get("sslmode") != "verify-full" {
		return errors.New("remote PostgreSQL requires sslmode=verify-full and a trusted certificate")
	}
	var hosts []string
	for _, address := range []string{cfg.AuthRedisURL, cfg.CacheRedisURL} {
		parsed, err := url.Parse(address)
		if err != nil || parsed.Hostname() == "" || (parsed.Scheme != "redis" && parsed.Scheme != "rediss") {
			return errors.New("invalid Redis URI")
		}
		if !loopback(parsed.Hostname()) && parsed.Scheme != "rediss" {
			return errors.New("remote Redis requires rediss:// with certificate verification")
		}
		hosts = append(hosts, strings.ToLower(parsed.Host))
	}
	if hosts[0] == hosts[1] {
		return errors.New("authentication and cache Redis require separate instances")
	}
	return nil
}
