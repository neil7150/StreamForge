// Package repository provides data access for the content service.
package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"streamforge/services/content/internal/model"
)

// MovieRepository handles database operations for movies.
type MovieRepository struct {
	db *pgxpool.Pool
}

// NewMovieRepository creates a new MovieRepository.
func NewMovieRepository(db *pgxpool.Pool) *MovieRepository {
	return &MovieRepository{db: db}
}

// movieColumns is the base set of columns to select for a movie.
const movieColumns = `m.id, m.title, m.slug, m.overview, m.tagline, m.release_date,
	m.runtime_minutes, m.language, m.poster_url, m.backdrop_url, m.trailer_url,
	m.imdb_id, m.content_rating, m.license_type, m.license_url, m.status,
	m.avg_rating, m.rating_count, m.view_count, m.created_at, m.updated_at`

// scanMovie scans a single movie row into a model.Movie.
func scanMovie(row pgx.Row) (model.Movie, error) {
	var m model.Movie
	err := row.Scan(
		&m.ID, &m.Title, &m.Slug, &m.Overview, &m.Tagline, &m.ReleaseDate,
		&m.RuntimeMinutes, &m.Language, &m.PosterURL, &m.BackdropURL, &m.TrailerURL,
		&m.ImdbID, &m.ContentRating, &m.LicenseType, &m.LicenseURL, &m.Status,
		&m.AvgRating, &m.RatingCount, &m.ViewCount, &m.CreatedAt, &m.UpdatedAt,
	)
	return m, err
}

// scanMovies scans multiple movie rows.
func scanMovies(rows pgx.Rows) ([]model.Movie, error) {
	var movies []model.Movie
	for rows.Next() {
		var m model.Movie
		if err := rows.Scan(
			&m.ID, &m.Title, &m.Slug, &m.Overview, &m.Tagline, &m.ReleaseDate,
			&m.RuntimeMinutes, &m.Language, &m.PosterURL, &m.BackdropURL, &m.TrailerURL,
			&m.ImdbID, &m.ContentRating, &m.LicenseType, &m.LicenseURL, &m.Status,
			&m.AvgRating, &m.RatingCount, &m.ViewCount, &m.CreatedAt, &m.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan movie row: %w", err)
		}
		movies = append(movies, m)
	}
	return movies, rows.Err()
}

// allowedSortColumns maps API sort parameter names to actual DB column names.
var allowedSortColumns = map[string]string{
	"title":        "m.title",
	"release_date": "m.release_date",
	"avg_rating":   "m.avg_rating",
	"view_count":   "m.view_count",
	"created_at":   "m.created_at",
}

// List returns a paginated list of movies, optionally filtered by genre slug.
func (r *MovieRepository) List(ctx context.Context, page, perPage int, genreSlug, sortBy, sortOrder string) ([]model.Movie, int64, error) {
	// Build WHERE clause
	var conditions []string
	var args []interface{}
	argIdx := 1

	conditions = append(conditions, "m.status = 'active'")

	if genreSlug != "" {
		conditions = append(conditions, fmt.Sprintf(
			"EXISTS (SELECT 1 FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id WHERE mg.movie_id = m.id AND g.slug = $%d)", argIdx,
		))
		args = append(args, genreSlug)
		argIdx++
	}

	where := "WHERE " + strings.Join(conditions, " AND ")

	// Count total
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM movies m %s", where)
	var total int64
	if err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count movies: %w", err)
	}

	// Resolve sort column
	sortCol, ok := allowedSortColumns[sortBy]
	if !ok {
		sortCol = "m.created_at"
	}
	orderDir := "DESC"
	if strings.ToLower(sortOrder) == "asc" {
		orderDir = "ASC"
	}

	offset := (page - 1) * perPage
	args = append(args, perPage, offset)

	query := fmt.Sprintf(`SELECT %s FROM movies m %s ORDER BY %s %s LIMIT $%d OFFSET $%d`,
		movieColumns, where, sortCol, orderDir, argIdx, argIdx+1,
	)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list movies: %w", err)
	}
	defer rows.Close()

	movies, err := scanMovies(rows)
	if err != nil {
		return nil, 0, err
	}

	return movies, total, nil
}

// GetBySlug returns a single movie by its slug.
func (r *MovieRepository) GetBySlug(ctx context.Context, slug string) (model.Movie, error) {
	query := fmt.Sprintf("SELECT %s FROM movies m WHERE m.slug = $1", movieColumns)
	m, err := scanMovie(r.db.QueryRow(ctx, query, slug))
	if err != nil {
		return m, fmt.Errorf("get movie by slug: %w", err)
	}
	return m, nil
}

// GetByID returns a single movie by its ID.
func (r *MovieRepository) GetByID(ctx context.Context, id uuid.UUID) (model.Movie, error) {
	query := fmt.Sprintf("SELECT %s FROM movies m WHERE m.id = $1", movieColumns)
	m, err := scanMovie(r.db.QueryRow(ctx, query, id))
	if err != nil {
		return m, fmt.Errorf("get movie by id: %w", err)
	}
	return m, nil
}

// Create inserts a new movie and returns it.
func (r *MovieRepository) Create(ctx context.Context, m model.Movie) (model.Movie, error) {
	query := `INSERT INTO movies (title, slug, overview, tagline, release_date, runtime_minutes,
		language, poster_url, backdrop_url, trailer_url, imdb_id, content_rating, license_type, license_url)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		RETURNING id, title, slug, overview, tagline, release_date, runtime_minutes, language,
		poster_url, backdrop_url, trailer_url, imdb_id, content_rating, license_type, license_url,
		status, avg_rating, rating_count, view_count, created_at, updated_at`

	created, err := scanMovie(r.db.QueryRow(ctx, query,
		m.Title, m.Slug, m.Overview, m.Tagline, m.ReleaseDate, m.RuntimeMinutes,
		m.Language, m.PosterURL, m.BackdropURL, m.TrailerURL, m.ImdbID,
		m.ContentRating, m.LicenseType, m.LicenseURL,
	))
	if err != nil {
		return created, fmt.Errorf("create movie: %w", err)
	}
	return created, nil
}

// Update modifies an existing movie.
func (r *MovieRepository) Update(ctx context.Context, id uuid.UUID, m model.Movie) (model.Movie, error) {
	query := `UPDATE movies SET
		title = COALESCE(NULLIF($2, ''), title),
		slug = COALESCE(NULLIF($3, ''), slug),
		overview = COALESCE($4, overview),
		tagline = COALESCE($5, tagline),
		release_date = COALESCE($6, release_date),
		runtime_minutes = COALESCE($7, runtime_minutes),
		language = COALESCE(NULLIF($8, ''), language),
		poster_url = COALESCE($9, poster_url),
		backdrop_url = COALESCE($10, backdrop_url),
		trailer_url = COALESCE($11, trailer_url),
		imdb_id = COALESCE($12, imdb_id),
		content_rating = COALESCE($13, content_rating),
		license_type = COALESCE(NULLIF($14, ''), license_type),
		license_url = COALESCE($15, license_url),
		status = COALESCE(NULLIF($16, ''), status),
		updated_at = NOW()
		WHERE id = $1
		RETURNING id, title, slug, overview, tagline, release_date, runtime_minutes, language,
		poster_url, backdrop_url, trailer_url, imdb_id, content_rating, license_type, license_url,
		status, avg_rating, rating_count, view_count, created_at, updated_at`

	updated, err := scanMovie(r.db.QueryRow(ctx, query,
		id, m.Title, m.Slug, m.Overview, m.Tagline, m.ReleaseDate, m.RuntimeMinutes,
		m.Language, m.PosterURL, m.BackdropURL, m.TrailerURL, m.ImdbID,
		m.ContentRating, m.LicenseType, m.LicenseURL, m.Status,
	))
	if err != nil {
		return updated, fmt.Errorf("update movie: %w", err)
	}
	return updated, nil
}

// Delete removes a movie by ID.
func (r *MovieRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result, err := r.db.Exec(ctx, "DELETE FROM movies WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("delete movie: %w", err)
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// GetTrending returns trending movies (highest view count in last 30 days, fallback to all-time).
func (r *MovieRepository) GetTrending(ctx context.Context, limit int) ([]model.Movie, error) {
	query := fmt.Sprintf(`SELECT %s FROM movies m
		WHERE m.status = 'active'
		ORDER BY m.view_count DESC, m.avg_rating DESC
		LIMIT $1`, movieColumns)

	rows, err := r.db.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("get trending movies: %w", err)
	}
	defer rows.Close()
	return scanMovies(rows)
}

// GetRecent returns recently added movies.
func (r *MovieRepository) GetRecent(ctx context.Context, limit int) ([]model.Movie, error) {
	query := fmt.Sprintf(`SELECT %s FROM movies m
		WHERE m.status = 'active'
		ORDER BY m.created_at DESC
		LIMIT $1`, movieColumns)

	rows, err := r.db.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("get recent movies: %w", err)
	}
	defer rows.Close()
	return scanMovies(rows)
}

// SetGenres replaces all genre associations for a movie.
func (r *MovieRepository) SetGenres(ctx context.Context, movieID uuid.UUID, genreIDs []uuid.UUID) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Remove existing genre associations
	if _, err := tx.Exec(ctx, "DELETE FROM movie_genres WHERE movie_id = $1", movieID); err != nil {
		return fmt.Errorf("clear movie genres: %w", err)
	}

	// Insert new associations
	for _, gid := range genreIDs {
		if _, err := tx.Exec(ctx,
			"INSERT INTO movie_genres (movie_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
			movieID, gid,
		); err != nil {
			return fmt.Errorf("set movie genre: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// GetGenres returns all genres associated with a movie.
func (r *MovieRepository) GetGenres(ctx context.Context, movieID uuid.UUID) ([]model.Genre, error) {
	query := `SELECT g.id, g.name, g.slug, g.description, g.created_at
		FROM genres g
		JOIN movie_genres mg ON mg.genre_id = g.id
		WHERE mg.movie_id = $1
		ORDER BY g.name`

	rows, err := r.db.Query(ctx, query, movieID)
	if err != nil {
		return nil, fmt.Errorf("get movie genres: %w", err)
	}
	defer rows.Close()

	var genres []model.Genre
	for rows.Next() {
		var g model.Genre
		if err := rows.Scan(&g.ID, &g.Name, &g.Slug, &g.Description, &g.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan genre: %w", err)
		}
		genres = append(genres, g)
	}
	return genres, rows.Err()
}

// GetMagnetCount returns the number of magnet links for a movie.
func (r *MovieRepository) GetMagnetCount(ctx context.Context, movieID uuid.UUID) (int, error) {
	var count int
	err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM magnet_links WHERE content_type = 'movie' AND content_id = $1", movieID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count magnets: %w", err)
	}
	return count, nil
}

// IncrementViewCount atomically increments the view count.
func (r *MovieRepository) IncrementViewCount(ctx context.Context, movieID uuid.UUID) error {
	_, err := r.db.Exec(ctx,
		"UPDATE movies SET view_count = view_count + 1, updated_at = $2 WHERE id = $1",
		movieID, time.Now(),
	)
	return err
}
