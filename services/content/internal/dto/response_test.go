package dto

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"streamforge/services/content/internal/model"
)

func TestToGenreResponse(t *testing.T) {
	id := uuid.New()
	desc := "A description"
	genre := model.Genre{
		ID:          id,
		Name:        "Action",
		Slug:        "action",
		Description: &desc,
	}

	resp := ToGenreResponse(genre)

	if resp.ID != id {
		t.Errorf("ID = %v; want %v", resp.ID, id)
	}
	if resp.Name != "Action" {
		t.Errorf("Name = %v; want Action", resp.Name)
	}
	if resp.Slug != "action" {
		t.Errorf("Slug = %v; want action", resp.Slug)
	}
	if resp.Description == nil || *resp.Description != desc {
		t.Errorf("Description mismatch")
	}
}

func TestToGenreResponses(t *testing.T) {
	genres := []model.Genre{
		{ID: uuid.New(), Name: "Action"},
		{ID: uuid.New(), Name: "Comedy"},
	}

	// Multiple genres
	resp := ToGenreResponses(genres)
	if len(resp) != 2 {
		t.Fatalf("len = %d; want 2", len(resp))
	}
	if resp[0].ID != genres[0].ID || resp[1].ID != genres[1].ID {
		t.Errorf("IDs mismatch in ToGenreResponses")
	}

	// Empty genres
	emptyResp := ToGenreResponses([]model.Genre{})
	if len(emptyResp) != 0 {
		t.Errorf("Expected empty response slice, got len %d", len(emptyResp))
	}

	// Nil genres
	nilResp := ToGenreResponses(nil)
	if len(nilResp) != 0 {
		t.Errorf("Expected empty response slice for nil input, got len %d", len(nilResp))
	}
}

func TestToMovieResponse(t *testing.T) {
	id := uuid.New()
	overview := "An overview"
	now := time.Now()
	movie := model.Movie{
		ID:          id,
		Title:       "Test Movie",
		Slug:        "test-movie",
		Overview:    &overview,
		Language:    "en",
		AvgRating:   4.5,
		RatingCount: 100,
		ViewCount:   500,
		CreatedAt:   now,
		Genres:      []model.Genre{{ID: uuid.New(), Name: "Drama"}},
	}
	magnetCount := 5

	resp := ToMovieResponse(movie, magnetCount)
	if resp.ID != id {
		t.Errorf("ID mismatch")
	}
	if resp.Title != "Test Movie" {
		t.Errorf("Title mismatch")
	}
	if resp.MagnetCount != magnetCount {
		t.Errorf("MagnetCount = %d; want %d", resp.MagnetCount, magnetCount)
	}
	if len(resp.Genres) != 1 {
		t.Errorf("Genres len = %d; want 1", len(resp.Genres))
	}
	if resp.CreatedAt != now {
		t.Errorf("CreatedAt mismatch")
	}
}

func TestToMovieDetailResponse(t *testing.T) {
	movie := model.Movie{
		ID:          uuid.New(),
		Title:       "Test Movie",
		Slug:        "test-movie",
		Language:    "en",
		Genres:      []model.Genre{{ID: uuid.New(), Name: "Drama"}},
		MagnetLinks: []model.MagnetLink{{ID: uuid.New(), MagnetURI: "magnet:?xt=urn:btih:123"}},
		Subtitles:   []model.Subtitle{{ID: uuid.New(), Language: "en", Format: "srt"}},
	}

	resp := ToMovieDetailResponse(movie)
	if resp.ID != movie.ID {
		t.Errorf("ID mismatch")
	}
	if len(resp.Genres) != 1 {
		t.Errorf("Genres len mismatch")
	}
	if len(resp.MagnetLinks) != 1 {
		t.Errorf("MagnetLinks len mismatch")
	}
	if resp.MagnetLinks[0].MagnetURI != "magnet:?xt=urn:btih:123" {
		t.Errorf("MagnetLink URI mismatch")
	}
	if len(resp.Subtitles) != 1 {
		t.Errorf("Subtitles len mismatch")
	}
	if resp.Subtitles[0].Format != "srt" {
		t.Errorf("Subtitle format mismatch")
	}
}

func TestToMagnetLinkResponse(t *testing.T) {
	ml := model.MagnetLink{
		ID:        uuid.New(),
		MagnetURI: "magnet:?xt=123",
		InfoHash:  "123",
		Quality:   "1080p",
		SeedCount: 10,
		Verified:  true,
	}

	resp := ToMagnetLinkResponse(ml)
	if resp.ID != ml.ID || resp.MagnetURI != ml.MagnetURI || resp.Quality != ml.Quality || resp.SeedCount != ml.SeedCount || resp.Verified != ml.Verified {
		t.Errorf("MagnetLinkResponse field mismatch")
	}
}

func TestToSubtitleResponse(t *testing.T) {
	sub := model.Subtitle{
		ID:           uuid.New(),
		Language:     "en",
		LanguageName: "English",
		SubtitleURL:  "http://example.com/sub.srt",
		Format:       "srt",
		IsDefault:    true,
	}

	resp := ToSubtitleResponse(sub)
	if resp.ID != sub.ID || resp.Language != sub.Language || resp.LanguageName != sub.LanguageName || resp.SubtitleURL != sub.SubtitleURL || resp.Format != sub.Format || resp.IsDefault != sub.IsDefault {
		t.Errorf("SubtitleResponse field mismatch")
	}
}
