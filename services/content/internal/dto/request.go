// Package dto contains data transfer objects for API requests and responses.
package dto

import (
	"github.com/google/uuid"
)

// ListMoviesQuery contains query parameters for listing movies.
type ListMoviesQuery struct {
	Page      int    `query:"page"`
	PerPage   int    `query:"per_page"`
	Genre     string `query:"genre"`
	SortBy    string `query:"sort_by"`
	SortOrder string `query:"sort_order"`
	Search    string `query:"search"`
}

// Normalize sets default values for pagination and sorting.
func (q *ListMoviesQuery) Normalize() {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PerPage < 1 || q.PerPage > 100 {
		q.PerPage = 20
	}
	switch q.SortBy {
	case "title", "release_date", "avg_rating", "view_count", "created_at":
		// valid
	default:
		q.SortBy = "created_at"
	}
	switch q.SortOrder {
	case "asc", "desc":
		// valid
	default:
		q.SortOrder = "desc"
	}
}

// ListShowsQuery contains query parameters for listing shows.
type ListShowsQuery struct {
	Page      int    `query:"page"`
	PerPage   int    `query:"per_page"`
	Genre     string `query:"genre"`
	SortBy    string `query:"sort_by"`
	SortOrder string `query:"sort_order"`
	Search    string `query:"search"`
}

// Normalize sets default values for pagination and sorting.
func (q *ListShowsQuery) Normalize() {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PerPage < 1 || q.PerPage > 100 {
		q.PerPage = 20
	}
	switch q.SortBy {
	case "title", "first_air_date", "avg_rating", "view_count", "created_at":
		// valid
	default:
		q.SortBy = "created_at"
	}
	switch q.SortOrder {
	case "asc", "desc":
		// valid
	default:
		q.SortOrder = "desc"
	}
}

// CreateMovieRequest is the request body for creating a movie.
type CreateMovieRequest struct {
	Title          string    `json:"title" validate:"required,min=1,max=500"`
	Overview       *string   `json:"overview"`
	Tagline        *string   `json:"tagline"`
	ReleaseDate    *string   `json:"release_date"`
	RuntimeMinutes *int      `json:"runtime_minutes" validate:"omitempty,min=1"`
	Language       string    `json:"language" validate:"required,min=2,max=10"`
	PosterURL      *string   `json:"poster_url" validate:"omitempty,url"`
	BackdropURL    *string   `json:"backdrop_url" validate:"omitempty,url"`
	TrailerURL     *string   `json:"trailer_url" validate:"omitempty,url"`
	ImdbID         *string   `json:"imdb_id"`
	ContentRating  *string   `json:"content_rating"`
	LicenseType    string    `json:"license_type" validate:"required"`
	LicenseURL     *string   `json:"license_url" validate:"omitempty,url"`
	GenreIDs       []uuid.UUID `json:"genre_ids"`
}

// UpdateMovieRequest is the request body for updating a movie.
type UpdateMovieRequest struct {
	Title          *string   `json:"title" validate:"omitempty,min=1,max=500"`
	Overview       *string   `json:"overview"`
	Tagline        *string   `json:"tagline"`
	ReleaseDate    *string   `json:"release_date"`
	RuntimeMinutes *int      `json:"runtime_minutes" validate:"omitempty,min=1"`
	Language       *string   `json:"language" validate:"omitempty,min=2,max=10"`
	PosterURL      *string   `json:"poster_url" validate:"omitempty,url"`
	BackdropURL    *string   `json:"backdrop_url" validate:"omitempty,url"`
	TrailerURL     *string   `json:"trailer_url" validate:"omitempty,url"`
	ImdbID         *string   `json:"imdb_id"`
	ContentRating  *string   `json:"content_rating"`
	LicenseType    *string   `json:"license_type"`
	LicenseURL     *string   `json:"license_url" validate:"omitempty,url"`
	Status         *string   `json:"status" validate:"omitempty,oneof=active inactive pending_review"`
	GenreIDs       []uuid.UUID `json:"genre_ids"`
}

// CreateShowRequest is the request body for creating a show.
type CreateShowRequest struct {
	Title        string    `json:"title" validate:"required,min=1,max=500"`
	Overview     *string   `json:"overview"`
	FirstAirDate *string   `json:"first_air_date"`
	Language     string    `json:"language" validate:"required,min=2,max=10"`
	PosterURL    *string   `json:"poster_url" validate:"omitempty,url"`
	BackdropURL  *string   `json:"backdrop_url" validate:"omitempty,url"`
	LicenseType  string    `json:"license_type" validate:"required"`
	LicenseURL   *string   `json:"license_url" validate:"omitempty,url"`
	GenreIDs     []uuid.UUID `json:"genre_ids"`
}

// CreateEpisodeRequest is the request body for creating an episode.
type CreateEpisodeRequest struct {
	SeasonID       uuid.UUID `json:"season_id" validate:"required"`
	EpisodeNumber  int       `json:"episode_number" validate:"required,min=1"`
	Title          string    `json:"title" validate:"required,min=1,max=500"`
	Overview       *string   `json:"overview"`
	RuntimeMinutes *int      `json:"runtime_minutes" validate:"omitempty,min=1"`
	AirDate        *string   `json:"air_date"`
	StillURL       *string   `json:"still_url" validate:"omitempty,url"`
}

// CreateMagnetRequest is the request body for adding a magnet link.
type CreateMagnetRequest struct {
	ContentType   string `json:"content_type" validate:"required,oneof=movie episode"`
	ContentID     uuid.UUID `json:"content_id" validate:"required"`
	MagnetURI     string `json:"magnet_uri" validate:"required"`
	InfoHash      string `json:"info_hash" validate:"required,min=32,max=64"`
	Quality       string `json:"quality" validate:"required"`
	Codec         *string `json:"codec"`
	FileSizeBytes *int64 `json:"file_size_bytes" validate:"omitempty,min=0"`
	Source        *string `json:"source"`
}
