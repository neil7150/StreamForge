package service

import (
	"strings"
	"testing"
)

func TestHashAndVerifyPassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
	}{
		{"normal", "Password123!"},
		{"empty", ""},
		{"long", strings.Repeat("a", 128)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hash, err := hashPassword(tt.password)
			if err != nil {
				t.Fatalf("hashPassword failed: %v", err)
			}
			
			if !strings.HasPrefix(hash, "$argon2id$") {
				t.Errorf("hash does not start with $argon2id$: %s", hash)
			}

			if !verifyPassword(tt.password, hash) {
				t.Errorf("verifyPassword failed for valid password")
			}

			if verifyPassword("wrongpassword", hash) {
				t.Errorf("verifyPassword succeeded for wrong password")
			}
		})
	}
}

func TestVerifyPassword_MalformedHash(t *testing.T) {
	tests := []struct {
		name string
		hash string
	}{
		{"empty", ""},
		{"invalid format", "invalid"},
		{"missing parts", "$argon2id$v=19$m=65536,t=1,p=4"},
		{"bad salt hex", "$argon2id$v=19$m=65536,t=1,p=4$zzzz$1234"},
		{"bad hash hex", "$argon2id$v=19$m=65536,t=1,p=4$1234$zzzz"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if verifyPassword("password", tt.hash) {
				t.Errorf("verifyPassword should fail for malformed hash: %s", tt.hash)
			}
		})
	}
}

func TestSplitOnce(t *testing.T) {
	tests := []struct {
		name     string
		s        string
		sep      string
		expected []string
	}{
		{"split middle", "a$b", "$", []string{"a", "b"}},
		{"split first", "$b", "$", []string{"", "b"}},
		{"split last", "a$", "$", []string{"a", ""}},
		{"no sep", "ab", "$", []string{"ab"}},
		{"multiple sep", "a$b$c", "$", []string{"a", "b$c"}},
		{"empty string", "", "$", []string{""}},
		{"longer sep", "abc--def", "--", []string{"abc", "def"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := splitOnce(tt.s, tt.sep)
			if len(result) != len(tt.expected) {
				t.Fatalf("expected len %d, got %d", len(tt.expected), len(result))
			}
			for i := range result {
				if result[i] != tt.expected[i] {
					t.Errorf("expected %v, got %v at index %d", tt.expected[i], result[i], i)
				}
			}
		})
	}
}

func TestHashRefreshToken(t *testing.T) {
	token1 := "my-refresh-token"
	token2 := "another-refresh-token"
	
	hash1 := hashRefreshToken(token1)
	hash1_again := hashRefreshToken(token1)
	hash2 := hashRefreshToken(token2)
	
	if hash1 != hash1_again {
		t.Errorf("hashRefreshToken is not deterministic")
	}
	
	if hash1 == hash2 {
		t.Errorf("hashRefreshToken produced same hash for different tokens")
	}
	
	if len(hash1) != 64 { // SHA-256 hex is 64 chars
		t.Errorf("expected hash length 64, got %d", len(hash1))
	}
}
