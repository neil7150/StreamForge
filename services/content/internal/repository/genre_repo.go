package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"streamforge/services/content/internal/model"
)

// GenreRepository handles database operations for genres.
type GenreRepository struct {
	db *pgxpool.Pool
}

// NewGenreRepository creates a new GenreRepository.
func NewGenreRepository(db *pgxpool.Pool) *GenreRepository {
	return &GenreRepository{db: db}
}

// List returns all genres ordered by name.
func (r *GenreRepository) List(ctx context.Context) ([]model.Genre, error) {
	query := `SELECT id, name, slug, description, created_at FROM genres ORDER BY name`

	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list genres: %w", err)
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

// GetBySlug returns a single genre by its slug.
func (r *GenreRepository) GetBySlug(ctx context.Context, slug string) (model.Genre, error) {
	query := `SELECT id, name, slug, description, created_at FROM genres WHERE slug = $1`

	var g model.Genre
	err := r.db.QueryRow(ctx, query, slug).Scan(&g.ID, &g.Name, &g.Slug, &g.Description, &g.CreatedAt)
	if err != nil {
		return g, fmt.Errorf("get genre by slug: %w", err)
	}
	return g, nil
}

// GetByID returns a single genre by its ID.
func (r *GenreRepository) GetByID(ctx context.Context, id string) (model.Genre, error) {
	query := `SELECT id, name, slug, description, created_at FROM genres WHERE id = $1`

	var g model.Genre
	err := r.db.QueryRow(ctx, query, id).Scan(&g.ID, &g.Name, &g.Slug, &g.Description, &g.CreatedAt)
	if err != nil {
		return g, fmt.Errorf("get genre by id: %w", err)
	}
	return g, nil
}

// GetMoviesByGenre returns paginated movies belonging to a genre.
func (r *GenreRepository) GetMoviesByGenre(ctx context.Context, genreSlug string, page, perPage int) ([]model.Movie, int64, error) {
	// Count
	countQuery := `SELECT COUNT(*) FROM movies m
		JOIN movie_genres mg ON mg.movie_id = m.id
		JOIN genres g ON g.id = mg.genre_id
		WHERE g.slug = $1 AND m.status = 'active'`

	var total int64
	if err := r.db.QueryRow(ctx, countQuery, genreSlug).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count genre movies: %w", err)
	}

	offset := (page - 1) * perPage
	query := fmt.Sprintf(`SELECT %s FROM movies m
		JOIN movie_genres mg ON mg.movie_id = m.id
		JOIN genres g ON g.id = mg.genre_id
		WHERE g.slug = $1 AND m.status = 'active'
		ORDER BY m.created_at DESC
		LIMIT $2 OFFSET $3`, movieColumns)

	rows, err := r.db.Query(ctx, query, genreSlug, perPage, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("get genre movies: %w", err)
	}
	defer rows.Close()

	movies, err := scanMovies(rows)
	if err != nil {
		return nil, 0, err
	}

	return movies, total, nil
}
