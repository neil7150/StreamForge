// Package model contains domain models for the content service.
package model

import (
	"time"

	"github.com/google/uuid"
)

// Genre represents a content genre.
type Genre struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Slug        string     `json:"slug"`
	Description *string    `json:"description,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// Movie represents a film in the catalog.
type Movie struct {
	ID             uuid.UUID  `json:"id"`
	Title          string     `json:"title"`
	Slug           string     `json:"slug"`
	Overview       *string    `json:"overview,omitempty"`
	Tagline        *string    `json:"tagline,omitempty"`
	ReleaseDate    *time.Time `json:"release_date,omitempty"`
	RuntimeMinutes *int       `json:"runtime_minutes,omitempty"`
	Language       string     `json:"language"`
	PosterURL      *string    `json:"poster_url,omitempty"`
	BackdropURL    *string    `json:"backdrop_url,omitempty"`
	TrailerURL     *string    `json:"trailer_url,omitempty"`
	ImdbID         *string    `json:"imdb_id,omitempty"`
	ContentRating  *string    `json:"content_rating,omitempty"`
	LicenseType    string     `json:"license_type"`
	LicenseURL     *string    `json:"license_url,omitempty"`
	Status         string     `json:"status"`
	AvgRating      float64    `json:"avg_rating"`
	RatingCount    int        `json:"rating_count"`
	ViewCount      int64      `json:"view_count"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`

	// Associations (not always loaded)
	Genres      []Genre      `json:"genres,omitempty"`
	MagnetLinks []MagnetLink `json:"magnet_links,omitempty"`
	Subtitles   []Subtitle   `json:"subtitles,omitempty"`
}

// Show represents a TV series.
type Show struct {
	ID           uuid.UUID  `json:"id"`
	Title        string     `json:"title"`
	Slug         string     `json:"slug"`
	Overview     *string    `json:"overview,omitempty"`
	FirstAirDate *time.Time `json:"first_air_date,omitempty"`
	LastAirDate  *time.Time `json:"last_air_date,omitempty"`
	Language     string     `json:"language"`
	PosterURL    *string    `json:"poster_url,omitempty"`
	BackdropURL  *string    `json:"backdrop_url,omitempty"`
	SeasonCount  int        `json:"season_count"`
	EpisodeCount int        `json:"episode_count"`
	Status       string     `json:"status"`
	LicenseType  string     `json:"license_type"`
	LicenseURL   *string    `json:"license_url,omitempty"`
	AvgRating    float64    `json:"avg_rating"`
	RatingCount  int        `json:"rating_count"`
	ViewCount    int64      `json:"view_count"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`

	// Associations
	Genres  []Genre  `json:"genres,omitempty"`
	Seasons []Season `json:"seasons,omitempty"`
}

// Season represents a season of a show.
type Season struct {
	ID           uuid.UUID  `json:"id"`
	ShowID       uuid.UUID  `json:"show_id"`
	SeasonNumber int        `json:"season_number"`
	Title        *string    `json:"title,omitempty"`
	Overview     *string    `json:"overview,omitempty"`
	PosterURL    *string    `json:"poster_url,omitempty"`
	AirDate      *time.Time `json:"air_date,omitempty"`
	EpisodeCount int        `json:"episode_count"`
	CreatedAt    time.Time  `json:"created_at"`

	// Associations
	Episodes []Episode `json:"episodes,omitempty"`
}

// Episode represents a single episode.
type Episode struct {
	ID             uuid.UUID  `json:"id"`
	ShowID         uuid.UUID  `json:"show_id"`
	SeasonID       uuid.UUID  `json:"season_id"`
	EpisodeNumber  int        `json:"episode_number"`
	Title          string     `json:"title"`
	Overview       *string    `json:"overview,omitempty"`
	RuntimeMinutes *int       `json:"runtime_minutes,omitempty"`
	AirDate        *time.Time `json:"air_date,omitempty"`
	StillURL       *string    `json:"still_url,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// MagnetLink represents a torrent magnet link for content.
type MagnetLink struct {
	ID            uuid.UUID  `json:"id"`
	ContentType   string     `json:"content_type"`
	ContentID     uuid.UUID  `json:"content_id"`
	MagnetURI     string     `json:"magnet_uri"`
	InfoHash      string     `json:"info_hash"`
	Quality       string     `json:"quality"`
	Codec         *string    `json:"codec,omitempty"`
	FileSizeBytes *int64     `json:"file_size_bytes,omitempty"`
	SeedCount     int        `json:"seed_count"`
	PeerCount     int        `json:"peer_count"`
	Verified      bool       `json:"verified"`
	Source        *string    `json:"source,omitempty"`
	LastCheckedAt *time.Time `json:"last_checked_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

// Subtitle represents a subtitle file for content.
type Subtitle struct {
	ID           uuid.UUID `json:"id"`
	ContentType  string    `json:"content_type"`
	ContentID    uuid.UUID `json:"content_id"`
	Language     string    `json:"language"`
	LanguageName string    `json:"language_name"`
	SubtitleURL  string    `json:"subtitle_url"`
	Format       string    `json:"format"`
	IsDefault    bool      `json:"is_default"`
	CreatedAt    time.Time `json:"created_at"`
}
