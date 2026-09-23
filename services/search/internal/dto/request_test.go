package dto

import (
	"testing"
)

func TestSearchQuery_Normalize(t *testing.T) {
	tests := []struct {
		name     string
		input    SearchQuery
		expected SearchQuery
	}{
		{
			name: "default values",
			input: SearchQuery{
				Q: "batman",
			},
			expected: SearchQuery{
				Q:       "batman",
				Type:    "all",
				Page:    1,
				PerPage: 20,
			},
		},
		{
			name: "valid values preserved",
			input: SearchQuery{
				Q:       "batman",
				Type:    "movie",
				Page:    2,
				PerPage: 10,
			},
			expected: SearchQuery{
				Q:       "batman",
				Type:    "movie",
				Page:    2,
				PerPage: 10,
			},
		},
		{
			name: "invalid type falls back to all",
			input: SearchQuery{
				Q:       "batman",
				Type:    "unknown",
				Page:    1,
				PerPage: 20,
			},
			expected: SearchQuery{
				Q:       "batman",
				Type:    "all",
				Page:    1,
				PerPage: 20,
			},
		},
		{
			name: "out of bounds page and per_page",
			input: SearchQuery{
				Q:       "batman",
				Page:    -5,
				PerPage: 100,
			},
			expected: SearchQuery{
				Q:       "batman",
				Type:    "all",
				Page:    1,
				PerPage: 20,
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tc.input.Normalize()
			if tc.input.Type != tc.expected.Type {
				t.Errorf("Expected Type %q, got %q", tc.expected.Type, tc.input.Type)
			}
			if tc.input.Page != tc.expected.Page {
				t.Errorf("Expected Page %d, got %d", tc.expected.Page, tc.input.Page)
			}
			if tc.input.PerPage != tc.expected.PerPage {
				t.Errorf("Expected PerPage %d, got %d", tc.expected.PerPage, tc.input.PerPage)
			}
		})
	}
}
