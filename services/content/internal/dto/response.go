package dto

import (
	"time"

	"github.com/google/uuid"

	"streamforge/services/content/internal/model"
)

// GenreResponse is the API response for a genre.
type GenreResponse struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	Description *string   `json:"description,omitempty"`
}

// MovieResponse is the API list response for a movie (summary view).
type MovieResponse struct {
	ID             uuid.UUID       `json:"id"`
	Title          string          `json:"title"`
	Slug           string          `json:"slug"`
	Overview       *string         `json:"overview,omitempty"`
	Tagline        *string         `json:"tagline,omitempty"`
	ReleaseDate    *time.Time      `json:"release_date,omitempty"`
	RuntimeMinutes *int            `json:"runtime_minutes,omitempty"`
	Language       string          `json:"language"`
	PosterURL      *string         `json:"poster_url,omitempty"`
	LicenseType    string          `json:"license_type"`
	Status         string          `json:"status"`
	AvgRating      float64         `json:"avg_rating"`
	RatingCount    int             `json:"rating_count"`
	ViewCount      int64           `json:"view_count"`
	Genres         []GenreResponse `json:"genres"`
	MagnetCount    int             `json:"magnet_count"`
	CreatedAt      time.Time       `json:"created_at"`
}

// MovieDetailResponse is the API detail response for a movie (full view).
type MovieDetailResponse struct {
	ID             uuid.UUID             `json:"id"`
	Title          string                `json:"title"`
	Slug           string                `json:"slug"`
	Overview       *string               `json:"overview,omitempty"`
	Tagline        *string               `json:"tagline,omitempty"`
	ReleaseDate    *time.Time            `json:"release_date,omitempty"`
	RuntimeMinutes *int                  `json:"runtime_minutes,omitempty"`
	Language       string                `json:"language"`
	PosterURL      *string               `json:"poster_url,omitempty"`
	BackdropURL    *string               `json:"backdrop_url,omitempty"`
	TrailerURL     *string               `json:"trailer_url,omitempty"`
	ImdbID         *string               `json:"imdb_id,omitempty"`
	ContentRating  *string               `json:"content_rating,omitempty"`
	LicenseType    string                `json:"license_type"`
	LicenseURL     *string               `json:"license_url,omitempty"`
	Status         string                `json:"status"`
	AvgRating      float64               `json:"avg_rating"`
	RatingCount    int                   `json:"rating_count"`
	ViewCount      int64                 `json:"view_count"`
	Genres         []GenreResponse       `json:"genres"`
	MagnetLinks    []MagnetLinkResponse  `json:"magnet_links"`
	Subtitles      []SubtitleResponse    `json:"subtitles"`
	CreatedAt      time.Time             `json:"created_at"`
	UpdatedAt      time.Time             `json:"updated_at"`
}

// ShowResponse is the API list response for a show (summary view).
type ShowResponse struct {
	ID           uuid.UUID       `json:"id"`
	Title        string          `json:"title"`
	Slug         string          `json:"slug"`
	Overview     *string         `json:"overview,omitempty"`
	FirstAirDate *time.Time      `json:"first_air_date,omitempty"`
	Language     string          `json:"language"`
	PosterURL    *string         `json:"poster_url,omitempty"`
	SeasonCount  int             `json:"season_count"`
	EpisodeCount int             `json:"episode_count"`
	Status       string          `json:"status"`
	LicenseType  string          `json:"license_type"`
	AvgRating    float64         `json:"avg_rating"`
	ViewCount    int64           `json:"view_count"`
	Genres       []GenreResponse `json:"genres"`
	CreatedAt    time.Time       `json:"created_at"`
}

// ShowDetailResponse is the API detail response for a show (full view).
type ShowDetailResponse struct {
	ID           uuid.UUID        `json:"id"`
	Title        string           `json:"title"`
	Slug         string           `json:"slug"`
	Overview     *string          `json:"overview,omitempty"`
	FirstAirDate *time.Time       `json:"first_air_date,omitempty"`
	LastAirDate  *time.Time       `json:"last_air_date,omitempty"`
	Language     string           `json:"language"`
	PosterURL    *string          `json:"poster_url,omitempty"`
	BackdropURL  *string          `json:"backdrop_url,omitempty"`
	SeasonCount  int              `json:"season_count"`
	EpisodeCount int              `json:"episode_count"`
	Status       string           `json:"status"`
	LicenseType  string           `json:"license_type"`
	LicenseURL   *string          `json:"license_url,omitempty"`
	AvgRating    float64          `json:"avg_rating"`
	RatingCount  int              `json:"rating_count"`
	ViewCount    int64            `json:"view_count"`
	Genres       []GenreResponse  `json:"genres"`
	Seasons      []SeasonResponse `json:"seasons"`
	CreatedAt    time.Time        `json:"created_at"`
	UpdatedAt    time.Time        `json:"updated_at"`
}

// SeasonResponse is the API response for a season.
type SeasonResponse struct {
	ID           uuid.UUID         `json:"id"`
	SeasonNumber int               `json:"season_number"`
	Title        *string           `json:"title,omitempty"`
	Overview     *string           `json:"overview,omitempty"`
	PosterURL    *string           `json:"poster_url,omitempty"`
	AirDate      *time.Time        `json:"air_date,omitempty"`
	EpisodeCount int               `json:"episode_count"`
	Episodes     []EpisodeResponse `json:"episodes,omitempty"`
}

// EpisodeResponse is the API response for an episode.
type EpisodeResponse struct {
	ID             uuid.UUID  `json:"id"`
	EpisodeNumber  int        `json:"episode_number"`
	Title          string     `json:"title"`
	Overview       *string    `json:"overview,omitempty"`
	RuntimeMinutes *int       `json:"runtime_minutes,omitempty"`
	AirDate        *time.Time `json:"air_date,omitempty"`
	StillURL       *string    `json:"still_url,omitempty"`
}

// MagnetLinkResponse is the API response for a magnet link.
type MagnetLinkResponse struct {
	ID            uuid.UUID  `json:"id"`
	MagnetURI     string     `json:"magnet_uri"`
	InfoHash      string     `json:"info_hash"`
	Quality       string     `json:"quality"`
	Codec         *string    `json:"codec,omitempty"`
	FileSizeBytes *int64     `json:"file_size_bytes,omitempty"`
	SeedCount     int        `json:"seed_count"`
	PeerCount     int        `json:"peer_count"`
	Verified      bool       `json:"verified"`
	Source        *string    `json:"source,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

// SubtitleResponse is the API response for a subtitle.
type SubtitleResponse struct {
	ID           uuid.UUID `json:"id"`
	Language     string    `json:"language"`
	LanguageName string    `json:"language_name"`
	SubtitleURL  string    `json:"subtitle_url"`
	Format       string    `json:"format"`
	IsDefault    bool      `json:"is_default"`
}

// ---- Mapper functions ----

// ToGenreResponse converts a Genre model to its API response DTO.
func ToGenreResponse(g model.Genre) GenreResponse {
	return GenreResponse{
		ID:          g.ID,
		Name:        g.Name,
		Slug:        g.Slug,
		Description: g.Description,
	}
}

// ToGenreResponses converts a slice of Genre models.
func ToGenreResponses(genres []model.Genre) []GenreResponse {
	out := make([]GenreResponse, len(genres))
	for i, g := range genres {
		out[i] = ToGenreResponse(g)
	}
	return out
}

// ToMovieResponse converts a Movie model to a summary API response DTO.
func ToMovieResponse(m model.Movie, magnetCount int) MovieResponse {
	return MovieResponse{
		ID:             m.ID,
		Title:          m.Title,
		Slug:           m.Slug,
		Overview:       m.Overview,
		Tagline:        m.Tagline,
		ReleaseDate:    m.ReleaseDate,
		RuntimeMinutes: m.RuntimeMinutes,
		Language:       m.Language,
		PosterURL:      m.PosterURL,
		LicenseType:    m.LicenseType,
		Status:         m.Status,
		AvgRating:      m.AvgRating,
		RatingCount:    m.RatingCount,
		ViewCount:      m.ViewCount,
		Genres:         ToGenreResponses(m.Genres),
		MagnetCount:    magnetCount,
		CreatedAt:      m.CreatedAt,
	}
}

// ToMovieDetailResponse converts a Movie model to a full detail API response DTO.
func ToMovieDetailResponse(m model.Movie) MovieDetailResponse {
	magnets := make([]MagnetLinkResponse, len(m.MagnetLinks))
	for i, ml := range m.MagnetLinks {
		magnets[i] = ToMagnetLinkResponse(ml)
	}

	subs := make([]SubtitleResponse, len(m.Subtitles))
	for i, s := range m.Subtitles {
		subs[i] = ToSubtitleResponse(s)
	}

	return MovieDetailResponse{
		ID:             m.ID,
		Title:          m.Title,
		Slug:           m.Slug,
		Overview:       m.Overview,
		Tagline:        m.Tagline,
		ReleaseDate:    m.ReleaseDate,
		RuntimeMinutes: m.RuntimeMinutes,
		Language:       m.Language,
		PosterURL:      m.PosterURL,
		BackdropURL:    m.BackdropURL,
		TrailerURL:     m.TrailerURL,
		ImdbID:         m.ImdbID,
		ContentRating:  m.ContentRating,
		LicenseType:    m.LicenseType,
		LicenseURL:     m.LicenseURL,
		Status:         m.Status,
		AvgRating:      m.AvgRating,
		RatingCount:    m.RatingCount,
		ViewCount:      m.ViewCount,
		Genres:         ToGenreResponses(m.Genres),
		MagnetLinks:    magnets,
		Subtitles:      subs,
		CreatedAt:      m.CreatedAt,
		UpdatedAt:      m.UpdatedAt,
	}
}

// ToMagnetLinkResponse converts a MagnetLink model to its API response DTO.
func ToMagnetLinkResponse(ml model.MagnetLink) MagnetLinkResponse {
	return MagnetLinkResponse{
		ID:            ml.ID,
		MagnetURI:     ml.MagnetURI,
		InfoHash:      ml.InfoHash,
		Quality:       ml.Quality,
		Codec:         ml.Codec,
		FileSizeBytes: ml.FileSizeBytes,
		SeedCount:     ml.SeedCount,
		PeerCount:     ml.PeerCount,
		Verified:      ml.Verified,
		Source:        ml.Source,
		CreatedAt:     ml.CreatedAt,
	}
}

// ToSubtitleResponse converts a Subtitle model to its API response DTO.
func ToSubtitleResponse(s model.Subtitle) SubtitleResponse {
	return SubtitleResponse{
		ID:           s.ID,
		Language:     s.Language,
		LanguageName: s.LanguageName,
		SubtitleURL:  s.SubtitleURL,
		Format:       s.Format,
		IsDefault:    s.IsDefault,
	}
}
