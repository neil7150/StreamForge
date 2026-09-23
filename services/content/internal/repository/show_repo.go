package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"streamforge/services/content/internal/model"
)

var ErrShowNotFound = errors.New("show not found")

type ShowRepository struct {
	db *pgxpool.Pool
}

func NewShowRepository(db *pgxpool.Pool) *ShowRepository {
	return &ShowRepository{db: db}
}

const showColumns = `s.id, s.title, s.slug, s.overview, s.first_air_date, s.last_air_date, s.language, s.poster_url, s.backdrop_url, s.season_count, s.episode_count, s.status, s.license_type, s.license_url, s.avg_rating, s.rating_count, s.view_count, s.created_at, s.updated_at`

func scanShow(row pgx.Row) (model.Show, error) {
	var s model.Show
	err := row.Scan(
		&s.ID, &s.Title, &s.Slug, &s.Overview, &s.FirstAirDate, &s.LastAirDate,
		&s.Language, &s.PosterURL, &s.BackdropURL, &s.SeasonCount, &s.EpisodeCount,
		&s.Status, &s.LicenseType, &s.LicenseURL, &s.AvgRating, &s.RatingCount,
		&s.ViewCount, &s.CreatedAt, &s.UpdatedAt,
	)
	return s, err
}

func scanShows(rows pgx.Rows) ([]model.Show, error) {
	var shows []model.Show
	for rows.Next() {
		var s model.Show
		if err := rows.Scan(
			&s.ID, &s.Title, &s.Slug, &s.Overview, &s.FirstAirDate, &s.LastAirDate,
			&s.Language, &s.PosterURL, &s.BackdropURL, &s.SeasonCount, &s.EpisodeCount,
			&s.Status, &s.LicenseType, &s.LicenseURL, &s.AvgRating, &s.RatingCount,
			&s.ViewCount, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan show row: %w", err)
		}
		shows = append(shows, s)
	}
	return shows, rows.Err()
}

var allowedShowSortColumns = map[string]string{
	"title":          "s.title",
	"first_air_date": "s.first_air_date",
	"avg_rating":     "s.avg_rating",
	"view_count":     "s.view_count",
	"created_at":     "s.created_at",
}

func (r *ShowRepository) List(ctx context.Context, page, perPage int, genreSlug, sortBy, sortOrder string) ([]model.Show, int64, error) {
	var conditions []string
	var args []interface{}
	argIdx := 1

	conditions = append(conditions, "s.status = 'active'")

	if genreSlug != "" {
		conditions = append(conditions, fmt.Sprintf(
			"EXISTS (SELECT 1 FROM show_genres sg JOIN genres g ON g.id = sg.genre_id WHERE sg.show_id = s.id AND g.slug = $%d)", argIdx,
		))
		args = append(args, genreSlug)
		argIdx++
	}

	where := "WHERE " + strings.Join(conditions, " AND ")

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM shows s %s", where)
	var total int64
	if err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count shows: %w", err)
	}

	sortCol, ok := allowedShowSortColumns[sortBy]
	if !ok {
		sortCol = "s.created_at"
	}
	orderDir := "DESC"
	if strings.ToLower(sortOrder) == "asc" {
		orderDir = "ASC"
	}

	offset := (page - 1) * perPage
	args = append(args, perPage, offset)

	query := fmt.Sprintf(`SELECT %s FROM shows s %s ORDER BY %s %s LIMIT $%d OFFSET $%d`,
		showColumns, where, sortCol, orderDir, argIdx, argIdx+1,
	)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list shows: %w", err)
	}
	defer rows.Close()

	shows, err := scanShows(rows)
	if err != nil {
		return nil, 0, err
	}

	return shows, total, nil
}

func (r *ShowRepository) GetBySlug(ctx context.Context, slug string) (model.Show, error) {
	query := fmt.Sprintf("SELECT %s FROM shows s WHERE s.slug = $1", showColumns)
	s, err := scanShow(r.db.QueryRow(ctx, query, slug))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return s, ErrShowNotFound
		}
		return s, fmt.Errorf("get show by slug: %w", err)
	}
	return s, nil
}

func (r *ShowRepository) GetByID(ctx context.Context, id uuid.UUID) (model.Show, error) {
	query := fmt.Sprintf("SELECT %s FROM shows s WHERE s.id = $1", showColumns)
	s, err := scanShow(r.db.QueryRow(ctx, query, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return s, ErrShowNotFound
		}
		return s, fmt.Errorf("get show by id: %w", err)
	}
	return s, nil
}

func (r *ShowRepository) Create(ctx context.Context, s model.Show) (model.Show, error) {
	query := `INSERT INTO shows (title, slug, overview, first_air_date, last_air_date, language, poster_url, backdrop_url, license_type, license_url)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, title, slug, overview, first_air_date, last_air_date, language, poster_url, backdrop_url, season_count, episode_count, status, license_type, license_url, avg_rating, rating_count, view_count, created_at, updated_at`

	created, err := scanShow(r.db.QueryRow(ctx, query,
		s.Title, s.Slug, s.Overview, s.FirstAirDate, s.LastAirDate,
		s.Language, s.PosterURL, s.BackdropURL,
		s.LicenseType, s.LicenseURL,
	))
	if err != nil {
		return created, fmt.Errorf("create show: %w", err)
	}
	return created, nil
}

func (r *ShowRepository) Update(ctx context.Context, id uuid.UUID, s model.Show) (model.Show, error) {
	query := `UPDATE shows SET
		title = COALESCE(NULLIF($2, ''), title),
		slug = COALESCE(NULLIF($3, ''), slug),
		overview = COALESCE($4, overview),
		first_air_date = COALESCE($5, first_air_date),
		last_air_date = COALESCE($6, last_air_date),
		language = COALESCE(NULLIF($7, ''), language),
		poster_url = COALESCE($8, poster_url),
		backdrop_url = COALESCE($9, backdrop_url),
		license_type = COALESCE(NULLIF($10, ''), license_type),
		license_url = COALESCE($11, license_url),
		status = COALESCE(NULLIF($12, ''), status),
		updated_at = NOW()
		WHERE id = $1
		RETURNING id, title, slug, overview, first_air_date, last_air_date, language, poster_url, backdrop_url, season_count, episode_count, status, license_type, license_url, avg_rating, rating_count, view_count, created_at, updated_at`

	updated, err := scanShow(r.db.QueryRow(ctx, query,
		id, s.Title, s.Slug, s.Overview, s.FirstAirDate, s.LastAirDate,
		s.Language, s.PosterURL, s.BackdropURL, s.LicenseType, s.LicenseURL, s.Status,
	))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return updated, ErrShowNotFound
		}
		return updated, fmt.Errorf("update show: %w", err)
	}
	return updated, nil
}

func (r *ShowRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result, err := r.db.Exec(ctx, "DELETE FROM shows WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("delete show: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrShowNotFound
	}
	return nil
}

func (r *ShowRepository) SetGenres(ctx context.Context, showID uuid.UUID, genreIDs []uuid.UUID) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "DELETE FROM show_genres WHERE show_id = $1", showID); err != nil {
		return fmt.Errorf("clear show genres: %w", err)
	}

	for _, gid := range genreIDs {
		if _, err := tx.Exec(ctx,
			"INSERT INTO show_genres (show_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
			showID, gid,
		); err != nil {
			return fmt.Errorf("set show genre: %w", err)
		}
	}

	return tx.Commit(ctx)
}

func (r *ShowRepository) GetGenres(ctx context.Context, showID uuid.UUID) ([]model.Genre, error) {
	query := `SELECT g.id, g.name, g.slug, g.description, g.created_at
		FROM genres g
		JOIN show_genres sg ON sg.genre_id = g.id
		WHERE sg.show_id = $1
		ORDER BY g.name`

	rows, err := r.db.Query(ctx, query, showID)
	if err != nil {
		return nil, fmt.Errorf("get show genres: %w", err)
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

func (r *ShowRepository) GetSeasons(ctx context.Context, showID uuid.UUID) ([]model.Season, error) {
	query := `SELECT id, show_id, season_number, title, overview, poster_url, air_date, episode_count
		FROM seasons
		WHERE show_id = $1
		ORDER BY season_number ASC`

	rows, err := r.db.Query(ctx, query, showID)
	if err != nil {
		return nil, fmt.Errorf("get seasons: %w", err)
	}
	defer rows.Close()

	var seasons []model.Season
	for rows.Next() {
		var s model.Season
		if err := rows.Scan(&s.ID, &s.ShowID, &s.SeasonNumber, &s.Title, &s.Overview, &s.PosterURL, &s.AirDate, &s.EpisodeCount); err != nil {
			return nil, fmt.Errorf("scan season: %w", err)
		}
		seasons = append(seasons, s)
	}
	return seasons, rows.Err()
}

func (r *ShowRepository) GetEpisodes(ctx context.Context, seasonID uuid.UUID) ([]model.Episode, error) {
	query := `SELECT id, season_id, episode_number, title, overview, runtime_minutes, air_date, still_url
		FROM episodes
		WHERE season_id = $1
		ORDER BY episode_number ASC`

	rows, err := r.db.Query(ctx, query, seasonID)
	if err != nil {
		return nil, fmt.Errorf("get episodes: %w", err)
	}
	defer rows.Close()

	var episodes []model.Episode
	for rows.Next() {
		var e model.Episode
		if err := rows.Scan(&e.ID, &e.SeasonID, &e.EpisodeNumber, &e.Title, &e.Overview, &e.RuntimeMinutes, &e.AirDate, &e.StillURL); err != nil {
			return nil, fmt.Errorf("scan episode: %w", err)
		}
		episodes = append(episodes, e)
	}
	return episodes, rows.Err()
}

func (r *ShowRepository) CreateSeason(ctx context.Context, s model.Season) (model.Season, error) {
	query := `INSERT INTO seasons (show_id, season_number, title, overview, poster_url, air_date)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, show_id, season_number, title, overview, poster_url, air_date, episode_count`

	err := r.db.QueryRow(ctx, query,
		s.ShowID, s.SeasonNumber, s.Title, s.Overview, s.PosterURL, s.AirDate,
	).Scan(&s.ID, &s.ShowID, &s.SeasonNumber, &s.Title, &s.Overview, &s.PosterURL, &s.AirDate, &s.EpisodeCount)
	
	if err != nil {
		return s, fmt.Errorf("create season: %w", err)
	}
	return s, nil
}

func (r *ShowRepository) CreateEpisode(ctx context.Context, e model.Episode) (model.Episode, error) {
	query := `INSERT INTO episodes (season_id, episode_number, title, overview, runtime_minutes, air_date, still_url)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, season_id, episode_number, title, overview, runtime_minutes, air_date, still_url`

	err := r.db.QueryRow(ctx, query,
		e.SeasonID, e.EpisodeNumber, e.Title, e.Overview, e.RuntimeMinutes, e.AirDate, e.StillURL,
	).Scan(&e.ID, &e.SeasonID, &e.EpisodeNumber, &e.Title, &e.Overview, &e.RuntimeMinutes, &e.AirDate, &e.StillURL)
	
	if err != nil {
		return e, fmt.Errorf("create episode: %w", err)
	}
	return e, nil
}

func (r *ShowRepository) IncrementViewCount(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx,
		"UPDATE shows SET view_count = view_count + 1, updated_at = $2 WHERE id = $1",
		id, time.Now(),
	)
	return err
}
