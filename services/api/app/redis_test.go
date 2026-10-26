package app

import (
	"context"
	"errors"
	"testing"

	"github.com/redis/go-redis/v9"
)

type policyHook struct {
	value   string
	failure error
	called  bool
}

func (h *policyHook) DialHook(next redis.DialHook) redis.DialHook { return next }
func (h *policyHook) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return next
}
func (h *policyHook) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		h.called = true
		if h.failure != nil {
			return h.failure
		}
		cmd.(*redis.MapStringStringCmd).SetVal(map[string]string{"maxmemory-policy": h.value})
		return nil
	}
}

func TestLivePolicyNeverFallsBackFromDenialOrEviction(t *testing.T) {
	for _, test := range []struct {
		mode, value string
		failure     error
		wantError   bool
	}{
		{"", "noeviction", nil, false},
		{"live", "allkeys-lru", nil, true},
		{"live", "", errors.New("NOPERM configuration denied"), true},
	} {
		client := redis.NewClient(&redis.Options{})
		hook := &policyHook{value: test.value, failure: test.failure}
		client.AddHook(hook)
		err := VerifyAuthRedisPolicy(context.Background(), client, Config{AuthRedisPolicyMode: test.mode})
		client.Close()
		if (err != nil) != test.wantError || !hook.called {
			t.Fatalf("live check mode %q: %v called=%v", test.mode, err, hook.called)
		}
	}
}

func TestBotkeepPolicyRequiresConfirmationForExactTLSEndpoint(t *testing.T) {
	valid := Config{AuthRedisURL: "rediss://user:private@redis.example:1234/0", AuthRedisPolicyMode: "botkeep-staff-confirmed", AuthRedisAttestedEndpoint: "redis.example:1234", AuthRedisAttestation: "Staff ticket confirmation 2026-10-26"}
	if err := VerifyAuthRedisPolicy(context.Background(), nil, valid); err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*Config){
		func(c *Config) { c.AuthRedisPolicyMode = "skip" },
		func(c *Config) { c.AuthRedisAttestation = "" },
		func(c *Config) { c.AuthRedisAttestation = "REPLACE_WITH_REFERENCE" },
		func(c *Config) { c.AuthRedisAttestedEndpoint = "other.example:1234" },
		func(c *Config) { c.AuthRedisAttestedEndpoint = "redis.example:5678" },
		func(c *Config) { c.AuthRedisURL = "redis://redis.example:1234/0" },
	} {
		cfg := valid
		change(&cfg)
		if err := VerifyAuthRedisPolicy(context.Background(), nil, cfg); err == nil {
			t.Fatal("invalid staff confirmation accepted")
		}
	}
}
