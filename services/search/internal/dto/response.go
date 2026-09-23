package dto

import (
	"time"

	"github.com/google/uuid"
)

type SearchResultItem struct {
	ID          uuid.UUID  `json:"id"`
	Type        string     `json:"type"` // "movie" or "show"
	Title       string     `json:"title"`
	Slug        string     `json:"slug"`
	Overview    *string    `json:"overview,omitempty"`
	PosterURL   *string    `json:"poster_url,omitempty"`
	Language    string     `json:"language"`
	AvgRating   float64    `json:"avg_rating"`
	ViewCount   int64      `json:"view_count"`
	ReleaseDate *time.Time `json:"release_date,omitempty"`
	Rank        float64    `json:"rank"`
}

type SuggestResultItem struct {
	ID    uuid.UUID `json:"id"`
	Type  string    `json:"type"`
	Title string    `json:"title"`
	Slug  string    `json:"slug"`
}
