package service

import (
	"testing"
	"streamforge/services/content/internal/model"
)

func TestGenerateSlug(t *testing.T) {
	tests := []struct {
		name     string
		title    string
		expected string
	}{
		{"normal", "The Matrix", "the-matrix"},
		{"special characters", "Avengers: Infinity War!", "avengers-infinity-war"},
		{"multiple spaces and dashes", "Hello - World", "hello-world"},
		{"empty", "", ""}, 
		{"only special chars", "!@#$", ""},
		{"unicode", "Æon Flux", "on-flux"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := generateSlug(tt.title)
			if tt.expected != "" {
				if got != tt.expected {
					t.Errorf("generateSlug(%q) = %q; want %q", tt.title, got, tt.expected)
				}
			} else {
				if len(got) != 8 {
					t.Errorf("generateSlug(%q) generated fallback slug %q of length %d; want length 8", tt.title, got, len(got))
				}
			}
		})
	}
}

func TestLimitMovies(t *testing.T) {
	movies := []model.Movie{
		{Title: "A"}, {Title: "B"}, {Title: "C"},
	}

	tests := []struct {
		name     string
		limit    int
		expected int
	}{
		{"negative limit", -1, 0},
		{"zero limit", 0, 0},
		{"less than slice length", 2, 2},
		{"exact match", 3, 3},
		{"greater than slice length", 5, 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := limitMovies(movies, tt.limit)
			if len(got) != tt.expected {
				t.Errorf("limitMovies(..., %d) returned slice of length %d; want %d", tt.limit, len(got), tt.expected)
			}
		})
	}
}

func TestErrNotFound(t *testing.T) {
	if ErrNotFound == nil {
		t.Error("ErrNotFound should not be nil")
	}
	if ErrNotFound.Error() != "resource not found" {
		t.Errorf("ErrNotFound message = %q; want 'resource not found'", ErrNotFound.Error())
	}
}
