package app

import (
	"context"
	"crypto/x509"
	"errors"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

func OpenRedis(ctx context.Context, address, caFile string) (*redis.Client, error) {
	options, err := redis.ParseURL(address)
	if err != nil {
		return nil, errors.New("invalid Redis URI")
	}
	if options.TLSConfig != nil && options.TLSConfig.InsecureSkipVerify {
		return nil, errors.New("Redis TLS certificate verification cannot be disabled")
	}
	options.PoolSize, options.MinIdleConns = 4, 1
	options.DialTimeout, options.ReadTimeout, options.WriteTimeout, options.PoolTimeout = 5*time.Second, 5*time.Second, 5*time.Second, 5*time.Second
	if caFile != "" {
		if options.TLSConfig == nil {
			return nil, errors.New("a Redis CA file requires a rediss:// TLS connection")
		}
		roots, err := x509.SystemCertPool()
		if err != nil {
			roots = x509.NewCertPool()
		}
		data, err := os.ReadFile(caFile)
		if err != nil {
			return nil, errors.New("Redis CA file could not be read")
		}
		if !roots.AppendCertsFromPEM(data) {
			return nil, errors.New("Redis CA file contains no valid certificate")
		}
		options.TLSConfig.RootCAs = roots
	}
	client := redis.NewClient(options)
	if err := client.Ping(ctx).Err(); err != nil {
		client.Close()
		return nil, errors.New("Redis connection/TLS verification failed")
	}
	return client, nil
}

func CheckAuthRedisPolicy(ctx context.Context, client *redis.Client) error {
	settings, err := client.ConfigGet(ctx, "maxmemory-policy").Result()
	if err != nil {
		return errors.New("cannot verify authentication Redis eviction policy; provider must allow this read-only check")
	}
	if settings["maxmemory-policy"] != "noeviction" {
		return errors.New("authentication Redis must use noeviction; cache eviction must not discard token revocations")
	}
	return nil
}

func validateAuthRedisPolicyMode(cfg Config) error {
	switch cfg.AuthRedisPolicyMode {
	case "", "live":
		return nil
	case "botkeep-staff-confirmed":
		endpoint, err := url.Parse(cfg.AuthRedisURL)
		if err != nil || endpoint.Scheme != "rediss" || endpoint.Host == "" || !strings.EqualFold(endpoint.Host, cfg.AuthRedisAttestedEndpoint) {
			return errors.New("Botkeep staff confirmation must name the exact TLS authentication Redis host:port")
		}
		if strings.TrimSpace(cfg.AuthRedisAttestation) == "" || strings.HasPrefix(cfg.AuthRedisAttestation, "REPLACE_") {
			return errors.New("Botkeep mode requires a recorded staff confirmation reference in AUTH_REDIS_ATTESTATION")
		}
		return nil
	default:
		return errors.New("AUTH_REDIS_POLICY_MODE must be live or botkeep-staff-confirmed")
	}
}

// Botkeep's application ACL disallows CONFIG and INFO. This explicit mode relies
// on a staff-confirmed deployment configuration, not an automatic fallback from
// an error or a claim that PING verifies policy. Connection/TLS checks still run.
func VerifyAuthRedisPolicy(ctx context.Context, client *redis.Client, cfg Config) error {
	if err := validateAuthRedisPolicyMode(cfg); err != nil {
		return err
	}
	if cfg.AuthRedisPolicyMode == "botkeep-staff-confirmed" {
		return nil
	}
	return CheckAuthRedisPolicy(ctx, client)
}
