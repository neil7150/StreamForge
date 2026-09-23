package service

import (
	"testing"
	"github.com/rs/zerolog"
)

func TestNewGenreService(t *testing.T) {
	logger := zerolog.Nop()
	svc := NewGenreService(nil, nil, nil, logger)
	if svc == nil {
		t.Fatal("NewGenreService() returned nil")
	}
	if svc.genreRepo != nil {
		t.Error("Expected genreRepo to be nil")
	}
	if svc.movieRepo != nil {
		t.Error("Expected movieRepo to be nil")
	}
	if svc.rdb != nil {
		t.Error("Expected rdb to be nil")
	}
}
