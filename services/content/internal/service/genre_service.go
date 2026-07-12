package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"streamforge/services/content/internal/model"
	"streamforge/services/content/internal/repository"
)

// Cache TTL for genres (refreshed rarely since genres don't change often).
const cacheTTLGenres = 24 * time.Hour

// Cache key for all genres.
const cacheKeyGenres = "content:genres:all"

// GenreService handles genre-related business logic.
type GenreService struct {
	genreRepo *repository.GenreRepository
	movieRepo *repository.MovieRepository
	rdb       *redis.Client
	log       zerolog.Logger
}

// NewGenreService creates a new GenreService.
func NewGenreService(
	genreRepo *repository.GenreRepository,
	movieRepo *repository.MovieRepository,
	rdb *redis.Client,
	log zerolog.Logger,
) *GenreService {
	return &GenreService{
		genreRepo: genreRepo,
		movieRepo: movieRepo,
		rdb:       rdb,
		log:       log.With().Str("service", "genre").Logger(),
	}
}

// ListGenres returns all genres (cached for 24 hours).
func (s *GenreService) ListGenres(ctx context.Context) ([]model.Genre, error) {
	// Try cache first
	data, err := s.rdb.Get(ctx, cacheKeyGenres).Bytes()
	if err == nil {
		var genres []model.Genre
		if err := json.Unmarshal(data, &genres); err == nil {
			s.log.Debug().Msg("genres cache hit")
			return genres, nil
		}
	}

	genres, err := s.genreRepo.List(ctx)
	if err != nil {
		s.log.Error().Err(err).Msg("failed to list genres")
		return nil, err
	}
	if genres == nil {
		genres = []model.Genre{}
	}

	// Cache the result
	if cacheData, err := json.Marshal(genres); err == nil {
		if err := s.rdb.Set(ctx, cacheKeyGenres, cacheData, cacheTTLGenres).Err(); err != nil {
			s.log.Warn().Err(err).Msg("failed to cache genres")
		}
	}

	return genres, nil
}

// GetGenreBySlug returns a genre by its slug.
func (s *GenreService) GetGenreBySlug(ctx context.Context, slug string) (model.Genre, error) {
	genre, err := s.genreRepo.GetBySlug(ctx, slug)
	if err != nil {
		s.log.Error().Err(err).Str("slug", slug).Msg("failed to get genre")
		return genre, err
	}
	return genre, nil
}

// GetGenreContent returns movies belonging to a genre (paginated).
func (s *GenreService) GetGenreContent(ctx context.Context, genreSlug string, page, perPage int) ([]model.Movie, int64, error) {
	movies, total, err := s.genreRepo.GetMoviesByGenre(ctx, genreSlug, page, perPage)
	if err != nil {
		s.log.Error().Err(err).Str("genre", genreSlug).Msg("failed to get genre content")
		return nil, 0, err
	}

	// Enrich with genres
	for i := range movies {
		genres, _ := s.movieRepo.GetGenres(ctx, movies[i].ID)
		movies[i].Genres = genres
	}

	return movies, total, nil
}
