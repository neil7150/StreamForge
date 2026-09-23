package dto

import (
	"testing"
)

func TestListMoviesQuery_Normalize(t *testing.T) {
	tests := []struct {
		name     string
		input    ListMoviesQuery
		expected ListMoviesQuery
	}{
		{
			name:     "defaults",
			input:    ListMoviesQuery{},
			expected: ListMoviesQuery{Page: 1, PerPage: 20, SortBy: "created_at", SortOrder: "desc"},
		},
		{
			name:     "valid values",
			input:    ListMoviesQuery{Page: 2, PerPage: 50, SortBy: "title", SortOrder: "asc"},
			expected: ListMoviesQuery{Page: 2, PerPage: 50, SortBy: "title", SortOrder: "asc"},
		},
		{
			name:     "invalid page and perPage",
			input:    ListMoviesQuery{Page: -1, PerPage: 150},
			expected: ListMoviesQuery{Page: 1, PerPage: 20, SortBy: "created_at", SortOrder: "desc"},
		},
		{
			name:     "invalid sort",
			input:    ListMoviesQuery{SortBy: "invalid_col", SortOrder: "random"},
			expected: ListMoviesQuery{Page: 1, PerPage: 20, SortBy: "created_at", SortOrder: "desc"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			q := tt.input
			q.Normalize()
			if q.Page != tt.expected.Page {
				t.Errorf("Page = %d; want %d", q.Page, tt.expected.Page)
			}
			if q.PerPage != tt.expected.PerPage {
				t.Errorf("PerPage = %d; want %d", q.PerPage, tt.expected.PerPage)
			}
			if q.SortBy != tt.expected.SortBy {
				t.Errorf("SortBy = %q; want %q", q.SortBy, tt.expected.SortBy)
			}
			if q.SortOrder != tt.expected.SortOrder {
				t.Errorf("SortOrder = %q; want %q", q.SortOrder, tt.expected.SortOrder)
			}
		})
	}
}

func TestListShowsQuery_Normalize(t *testing.T) {
	tests := []struct {
		name     string
		input    ListShowsQuery
		expected ListShowsQuery
	}{
		{
			name:     "defaults",
			input:    ListShowsQuery{},
			expected: ListShowsQuery{Page: 1, PerPage: 20, SortBy: "created_at", SortOrder: "desc"},
		},
		{
			name:     "valid values",
			input:    ListShowsQuery{Page: 3, PerPage: 10, SortBy: "first_air_date", SortOrder: "asc"},
			expected: ListShowsQuery{Page: 3, PerPage: 10, SortBy: "first_air_date", SortOrder: "asc"},
		},
		{
			name:     "invalid bounds",
			input:    ListShowsQuery{Page: 0, PerPage: 0},
			expected: ListShowsQuery{Page: 1, PerPage: 20, SortBy: "created_at", SortOrder: "desc"},
		},
		{
			name:     "invalid sorts",
			input:    ListShowsQuery{SortBy: "unknown", SortOrder: "up"},
			expected: ListShowsQuery{Page: 1, PerPage: 20, SortBy: "created_at", SortOrder: "desc"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			q := tt.input
			q.Normalize()
			if q.Page != tt.expected.Page {
				t.Errorf("Page = %d; want %d", q.Page, tt.expected.Page)
			}
			if q.PerPage != tt.expected.PerPage {
				t.Errorf("PerPage = %d; want %d", q.PerPage, tt.expected.PerPage)
			}
			if q.SortBy != tt.expected.SortBy {
				t.Errorf("SortBy = %q; want %q", q.SortBy, tt.expected.SortBy)
			}
			if q.SortOrder != tt.expected.SortOrder {
				t.Errorf("SortOrder = %q; want %q", q.SortOrder, tt.expected.SortOrder)
			}
		})
	}
}
