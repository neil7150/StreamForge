// Package service contains business logic for the content service.
package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"streamforge/services/content/internal/model"
	"streamforge/services/content/internal/repository"
)

// Cache TTL constants.
const (
	cacheTTLTrending = 15 * time.Minute
	cacheTTLRecent   = 15 * time.Minute
	cacheTTLMovie    = 1 * time.Hour
	cacheTTLFeatured = 30 * time.Minute
	maxCachedMovies  = 50
)

// Cache key prefixes.
const (
	cacheKeyMovieBySlug = "content:movie:slug:"
	cacheKeyMovieByID   = "content:movie:id:"
	cacheKeyTrending    = "content:movies:trending"
	cacheKeyRecent      = "content:movies:recent"
	cacheKeyFeatured    = "content:movies:featured"
)

// ContentService handles movie-related business logic.
type ContentService struct {
	movieRepo    *repository.MovieRepository
	magnetRepo   *repository.MagnetRepository
	subtitleRepo *repository.SubtitleRepository
	rdb          *redis.Client
	log          zerolog.Logger
}

// NewContentService creates a new ContentService.
func NewContentService(
	movieRepo *repository.MovieRepository,
	magnetRepo *repository.MagnetRepository,
	subtitleRepo *repository.SubtitleRepository,
	rdb *redis.Client,
	log zerolog.Logger,
) *ContentService {
	return &ContentService{
		movieRepo:    movieRepo,
		magnetRepo:   magnetRepo,
		subtitleRepo: subtitleRepo,
		rdb:          rdb,
		log:          log.With().Str("service", "content").Logger(),
	}
}

// ListMovies returns a paginated list of movies with genres loaded.
func (s *ContentService) ListMovies(ctx context.Context, page, perPage int, genre, sortBy, sortOrder string) ([]model.Movie, int64, error) {
	movies, total, err := s.movieRepo.List(ctx, page, perPage, genre, sortBy, sortOrder)
	if err != nil {
		s.log.Error().Err(err).Msg("failed to list movies")
		return nil, 0, err
	}

	// Enrich with genres and magnet count
	for i := range movies {
		genres, err := s.movieRepo.GetGenres(ctx, movies[i].ID)
		if err != nil {
			s.log.Warn().Err(err).Str("movie_id", movies[i].ID.String()).Msg("failed to load genres for movie")
			genres = []model.Genre{}
		}
		movies[i].Genres = genres
	}

	return movies, total, nil
}

// GetMovie returns a full movie detail by slug, including genres, magnets, and subtitles.
func (s *ContentService) GetMovie(ctx context.Context, slug string) (model.Movie, error) {
	// Try cache first
	cacheKey := cacheKeyMovieBySlug + slug
	if cached, err := s.getMovieFromCache(ctx, cacheKey); err == nil && cached.Status == "active" {
		s.log.Debug().Str("slug", slug).Msg("movie cache hit")
		s.incrementViewCountAsync(cached.ID)
		return cached, nil
	}

	movie, err := s.movieRepo.GetBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return movie, ErrNotFound
		}
		s.log.Error().Err(err).Str("slug", slug).Msg("failed to get movie")
		return movie, err
	}

	// Load associations
	if err := s.enrichMovie(ctx, &movie); err != nil {
		return movie, err
	}

	// Increment view count asynchronously
	s.incrementViewCountAsync(movie.ID)

	// Cache the enriched movie
	s.cacheMovie(ctx, cacheKey, movie, cacheTTLMovie)

	return movie, nil
}

// GetMovieByID returns a movie by its UUID.
func (s *ContentService) GetMovieByID(ctx context.Context, id uuid.UUID) (model.Movie, error) {
	cacheKey := cacheKeyMovieByID + id.String()
	if cached, err := s.getMovieFromCache(ctx, cacheKey); err == nil {
		return cached, nil
	}

	movie, err := s.movieRepo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return movie, ErrNotFound
		}
		return movie, err
	}

	if err := s.enrichMovie(ctx, &movie); err != nil {
		s.log.Warn().Err(err).Msg("failed to enrich movie")
	}

	s.cacheMovie(ctx, cacheKey, movie, cacheTTLMovie)
	return movie, nil
}

// CreateMovie creates a new movie.
func (s *ContentService) CreateMovie(ctx context.Context, movie model.Movie, genreIDs []uuid.UUID) (model.Movie, error) {
	movie.Slug = generateSlug(movie.Title)

	created, err := s.movieRepo.Create(ctx, movie)
	if err != nil {
		s.log.Error().Err(err).Str("title", movie.Title).Msg("failed to create movie")
		return created, err
	}

	// Set genres
	if len(genreIDs) > 0 {
		if err := s.movieRepo.SetGenres(ctx, created.ID, genreIDs); err != nil {
			s.log.Error().Err(err).Msg("failed to set genres for new movie")
			return created, err
		}
		genres, _ := s.movieRepo.GetGenres(ctx, created.ID)
		created.Genres = genres
	}

	s.invalidateMovieCaches(ctx)
	s.log.Info().Str("id", created.ID.String()).Str("title", created.Title).Msg("movie created")
	return created, nil
}

// UpdateMovie updates an existing movie.
func (s *ContentService) UpdateMovie(ctx context.Context, id uuid.UUID, movie model.Movie, genreIDs []uuid.UUID) (model.Movie, error) {
	previous, _ := s.movieRepo.GetByID(ctx, id)

	// Generate slug if title is being updated
	if movie.Title != "" {
		movie.Slug = generateSlug(movie.Title)
	}

	updated, err := s.movieRepo.Update(ctx, id, movie)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return updated, ErrNotFound
		}
		s.log.Error().Err(err).Str("id", id.String()).Msg("failed to update movie")
		return updated, err
	}

	// Update genres if provided
	if genreIDs != nil {
		if err := s.movieRepo.SetGenres(ctx, id, genreIDs); err != nil {
			s.log.Error().Err(err).Msg("failed to update movie genres")
			return updated, err
		}
	}

	if err := s.enrichMovie(ctx, &updated); err != nil {
		s.log.Warn().Err(err).Msg("failed to enrich updated movie")
	}

	// Invalidate caches
	s.invalidateMovieCaches(ctx)
	s.rdb.Del(ctx, cacheKeyMovieByID+id.String())
	s.rdb.Del(ctx, cacheKeyMovieBySlug+updated.Slug)
	if previous.Slug != "" && previous.Slug != updated.Slug {
		s.rdb.Del(ctx, cacheKeyMovieBySlug+previous.Slug)
	}

	s.log.Info().Str("id", id.String()).Msg("movie updated")
	return updated, nil
}

// DeleteMovie deletes a movie by ID.
func (s *ContentService) DeleteMovie(ctx context.Context, id uuid.UUID) error {
	// Get movie for cache invalidation
	movie, _ := s.movieRepo.GetByID(ctx, id)

	if err := s.movieRepo.Delete(ctx, id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		s.log.Error().Err(err).Str("id", id.String()).Msg("failed to delete movie")
		return err
	}

	// Invalidate caches
	s.invalidateMovieCaches(ctx)
	s.rdb.Del(ctx, cacheKeyMovieByID+id.String())
	if movie.Slug != "" {
		s.rdb.Del(ctx, cacheKeyMovieBySlug+movie.Slug)
	}

	s.log.Info().Str("id", id.String()).Msg("movie deleted")
	return nil
}

// GetMovieMagnets returns magnet links for a movie.
func (s *ContentService) GetMovieMagnets(ctx context.Context, movieID uuid.UUID) ([]model.MagnetLink, error) {
	if err := s.requirePublicMovie(ctx, movieID); err != nil {
		return nil, err
	}
	magnets, err := s.magnetRepo.GetByContent(ctx, "movie", movieID)
	if err != nil {
		s.log.Error().Err(err).Str("movie_id", movieID.String()).Msg("failed to get movie magnets")
		return nil, err
	}
	if magnets == nil {
		magnets = []model.MagnetLink{}
	}
	return magnets, nil
}

// AddMagnetLink creates a new magnet link.
func (s *ContentService) AddMagnetLink(ctx context.Context, ml model.MagnetLink) (model.MagnetLink, error) {
	created, err := s.magnetRepo.Create(ctx, ml)
	if err != nil {
		s.log.Error().Err(err).Msg("failed to create magnet link")
		return created, err
	}

	// Invalidate detail and list caches so magnet counts update immediately.
	s.invalidateMovieCaches(ctx)
	s.rdb.Del(ctx, cacheKeyMovieByID+ml.ContentID.String())
	if movie, err := s.movieRepo.GetByID(ctx, ml.ContentID); err == nil && movie.Slug != "" {
		s.rdb.Del(ctx, cacheKeyMovieBySlug+movie.Slug)
	}

	s.log.Info().Str("id", created.ID.String()).Str("content_id", ml.ContentID.String()).Msg("magnet link added")
	return created, nil
}

// GetMovieSubtitles returns subtitles for a movie.
func (s *ContentService) GetMovieSubtitles(ctx context.Context, movieID uuid.UUID) ([]model.Subtitle, error) {
	if err := s.requirePublicMovie(ctx, movieID); err != nil {
		return nil, err
	}
	subs, err := s.subtitleRepo.GetByContent(ctx, "movie", movieID)
	if err != nil {
		s.log.Error().Err(err).Str("movie_id", movieID.String()).Msg("failed to get movie subtitles")
		return nil, err
	}
	if subs == nil {
		subs = []model.Subtitle{}
	}
	return subs, nil
}

func (s *ContentService) requirePublicMovie(ctx context.Context, id uuid.UUID) error {
	movie, err := s.movieRepo.GetByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if movie.Status != "active" {
		return ErrNotFound
	}
	return nil
}

// GetTrending returns trending movies (cached).
func (s *ContentService) GetTrending(ctx context.Context, limit int) ([]model.Movie, error) {
	// Check cache
	if cached, err := s.getMoviesFromCache(ctx, cacheKeyTrending); err == nil {
		s.log.Debug().Msg("trending movies cache hit")
		return limitMovies(cached, limit), nil
	}

	movies, err := s.movieRepo.GetTrending(ctx, maxCachedMovies)
	if err != nil {
		s.log.Error().Err(err).Msg("failed to get trending movies")
		return nil, err
	}

	// Enrich with genres
	for i := range movies {
		genres, _ := s.movieRepo.GetGenres(ctx, movies[i].ID)
		movies[i].Genres = genres
	}

	s.cacheMovies(ctx, cacheKeyTrending, movies, cacheTTLTrending)
	return limitMovies(movies, limit), nil
}

// GetRecent returns recently added movies (cached).
func (s *ContentService) GetRecent(ctx context.Context, limit int) ([]model.Movie, error) {
	if cached, err := s.getMoviesFromCache(ctx, cacheKeyRecent); err == nil {
		s.log.Debug().Msg("recent movies cache hit")
		return limitMovies(cached, limit), nil
	}

	movies, err := s.movieRepo.GetRecent(ctx, maxCachedMovies)
	if err != nil {
		s.log.Error().Err(err).Msg("failed to get recent movies")
		return nil, err
	}

	for i := range movies {
		genres, _ := s.movieRepo.GetGenres(ctx, movies[i].ID)
		movies[i].Genres = genres
	}

	s.cacheMovies(ctx, cacheKeyRecent, movies, cacheTTLRecent)
	return limitMovies(movies, limit), nil
}

// GetFeatured returns featured movies (mix of high-rated and trending, cached).
func (s *ContentService) GetFeatured(ctx context.Context, limit int) ([]model.Movie, error) {
	if cached, err := s.getMoviesFromCache(ctx, cacheKeyFeatured); err == nil {
		s.log.Debug().Msg("featured movies cache hit")
		return limitMovies(cached, limit), nil
	}

	// Featured = highest rated active movies
	movies, _, err := s.movieRepo.List(ctx, 1, maxCachedMovies, "", "avg_rating", "desc")
	if err != nil {
		s.log.Error().Err(err).Msg("failed to get featured movies")
		return nil, err
	}

	for i := range movies {
		genres, _ := s.movieRepo.GetGenres(ctx, movies[i].ID)
		movies[i].Genres = genres
	}

	s.cacheMovies(ctx, cacheKeyFeatured, movies, cacheTTLFeatured)
	return limitMovies(movies, limit), nil
}

// GetMagnetCount returns the number of magnet links for a movie.
func (s *ContentService) GetMagnetCount(ctx context.Context, movieID uuid.UUID) int {
	count, err := s.movieRepo.GetMagnetCount(ctx, movieID)
	if err != nil {
		return 0
	}
	return count
}

// --- Cache helpers ---

func limitMovies(movies []model.Movie, limit int) []model.Movie {
	if limit < 0 {
		limit = 0
	}
	if limit >= len(movies) {
		return movies
	}
	return movies[:limit]
}

func (s *ContentService) incrementViewCountAsync(movieID uuid.UUID) {
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.movieRepo.IncrementViewCount(bgCtx, movieID); err != nil {
			s.log.Warn().Err(err).Str("movie_id", movieID.String()).Msg("failed to increment view count")
		}
	}()
}

func (s *ContentService) enrichMovie(ctx context.Context, movie *model.Movie) error {
	genres, err := s.movieRepo.GetGenres(ctx, movie.ID)
	if err != nil {
		return fmt.Errorf("load genres: %w", err)
	}
	movie.Genres = genres

	magnets, err := s.magnetRepo.GetByContent(ctx, "movie", movie.ID)
	if err != nil {
		return fmt.Errorf("load magnets: %w", err)
	}
	if magnets == nil {
		magnets = []model.MagnetLink{}
	}
	movie.MagnetLinks = magnets

	subs, err := s.subtitleRepo.GetByContent(ctx, "movie", movie.ID)
	if err != nil {
		return fmt.Errorf("load subtitles: %w", err)
	}
	if subs == nil {
		subs = []model.Subtitle{}
	}
	movie.Subtitles = subs

	return nil
}

func (s *ContentService) cacheMovie(ctx context.Context, key string, movie model.Movie, ttl time.Duration) {
	data, err := json.Marshal(movie)
	if err != nil {
		s.log.Warn().Err(err).Msg("failed to marshal movie for cache")
		return
	}
	if err := s.rdb.Set(ctx, key, data, ttl).Err(); err != nil {
		s.log.Warn().Err(err).Msg("failed to cache movie")
	}
}

func (s *ContentService) getMovieFromCache(ctx context.Context, key string) (model.Movie, error) {
	var movie model.Movie
	data, err := s.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return movie, err
	}
	if err := json.Unmarshal(data, &movie); err != nil {
		return movie, err
	}
	return movie, nil
}

func (s *ContentService) cacheMovies(ctx context.Context, key string, movies []model.Movie, ttl time.Duration) {
	data, err := json.Marshal(movies)
	if err != nil {
		s.log.Warn().Err(err).Msg("failed to marshal movies for cache")
		return
	}
	if err := s.rdb.Set(ctx, key, data, ttl).Err(); err != nil {
		s.log.Warn().Err(err).Msg("failed to cache movies")
	}
}

func (s *ContentService) getMoviesFromCache(ctx context.Context, key string) ([]model.Movie, error) {
	var movies []model.Movie
	data, err := s.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, &movies); err != nil {
		return nil, err
	}
	return movies, nil
}

func (s *ContentService) invalidateMovieCaches(ctx context.Context) {
	keys := []string{cacheKeyTrending, cacheKeyRecent, cacheKeyFeatured}
	if err := s.rdb.Del(ctx, keys...).Err(); err != nil {
		s.log.Warn().Err(err).Msg("failed to invalidate movie caches")
	}
}

// --- Slug generation ---

var (
	slugRegexp   = regexp.MustCompile(`[^a-z0-9]+`)
	slugDashTrim = regexp.MustCompile(`^-+|-+$`)
)

// generateSlug creates a URL-friendly slug from a title.
func generateSlug(title string) string {
	slug := strings.ToLower(title)
	slug = slugRegexp.ReplaceAllString(slug, "-")
	slug = slugDashTrim.ReplaceAllString(slug, "")
	if slug == "" {
		slug = uuid.New().String()[:8]
	}
	return slug
}

// ErrNotFound is returned when a requested resource does not exist.
var ErrNotFound = errors.New("resource not found")
