package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"streamforge/services/search/internal/dto"
)

const (
	cacheTTLSearch  = 5 * time.Minute
	cacheTTLSuggest = 2 * time.Minute
)

type SearchService struct {
	db  *pgxpool.Pool
	rdb *redis.Client
	log zerolog.Logger
}

func NewSearchService(db *pgxpool.Pool, rdb *redis.Client, log zerolog.Logger) *SearchService {
	return &SearchService{db: db, rdb: rdb, log: log.With().Str("service", "search").Logger()}
}

func (s *SearchService) Search(ctx context.Context, query dto.SearchQuery) ([]dto.SearchResultItem, int64, error) {
	query.Normalize()

	// Caching
	cacheKey := fmt.Sprintf("search:%s:%s:%d:%d", query.Q, query.Type, query.Page, query.PerPage)
	hash := sha256.Sum256([]byte(cacheKey))
	hashedKey := "search:" + hex.EncodeToString(hash[:])

	cached, err := s.rdb.Get(ctx, hashedKey).Result()
	if err == nil {
		var res struct {
			Items []dto.SearchResultItem `json:"items"`
			Total int64                  `json:"total"`
		}
		if err := json.Unmarshal([]byte(cached), &res); err == nil {
			return res.Items, res.Total, nil
		}
	}

	offset := (query.Page - 1) * query.PerPage
	limit := query.PerPage

	var items []dto.SearchResultItem
	var total int64

	movieQuery := `
		SELECT id, 'movie' as type, title, slug, overview, poster_url, language, avg_rating, view_count, release_date,
			   ts_rank(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(overview, '')), plainto_tsquery('english', $1)) as rank
		FROM movies
		WHERE status = 'active'
		  AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(overview, '')) @@ plainto_tsquery('english', $1)
	`
	movieCountQuery := `
		SELECT COUNT(id) FROM movies 
		WHERE status = 'active' AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(overview, '')) @@ plainto_tsquery('english', $1)
	`

	showQuery := `
		SELECT id, 'show' as type, title, slug, overview, poster_url, language, avg_rating, view_count, first_air_date as release_date,
			   ts_rank(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(overview, '')), plainto_tsquery('english', $1)) as rank
		FROM shows
		WHERE status = 'active'
		  AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(overview, '')) @@ plainto_tsquery('english', $1)
	`
	showCountQuery := `
		SELECT COUNT(id) FROM shows 
		WHERE status = 'active' AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(overview, '')) @@ plainto_tsquery('english', $1)
	`

	var sqlQuery string
	var countQuery string

	if query.Type == "movie" {
		sqlQuery = movieQuery + " ORDER BY rank DESC LIMIT $2 OFFSET $3"
		countQuery = movieCountQuery
	} else if query.Type == "show" {
		sqlQuery = showQuery + " ORDER BY rank DESC LIMIT $2 OFFSET $3"
		countQuery = showCountQuery
	} else {
		sqlQuery = fmt.Sprintf(`
			SELECT * FROM (
				%s
				UNION ALL
				%s
			) as combined
			ORDER BY rank DESC LIMIT $2 OFFSET $3
		`, movieQuery, showQuery)
		countQuery = fmt.Sprintf("SELECT (%s) + (%s)", movieCountQuery, showCountQuery)
	}

	// Get Total
	err = s.db.QueryRow(ctx, countQuery, query.Q).Scan(&total)
	if err != nil {
		s.log.Error().Err(err).Msg("failed to count search results")
		return nil, 0, err
	}

	// Get Items
	rows, err := s.db.Query(ctx, sqlQuery, query.Q, limit, offset)
	if err != nil {
		s.log.Error().Err(err).Msg("failed to execute search query")
		return nil, 0, err
	}
	defer rows.Close()

	for rows.Next() {
		var item dto.SearchResultItem
		err := rows.Scan(
			&item.ID, &item.Type, &item.Title, &item.Slug,
			&item.Overview, &item.PosterURL, &item.Language,
			&item.AvgRating, &item.ViewCount, &item.ReleaseDate, &item.Rank,
		)
		if err != nil {
			s.log.Error().Err(err).Msg("failed to scan search result")
			continue
		}
		items = append(items, item)
	}

	// Save to cache
	resToCache := struct {
		Items []dto.SearchResultItem `json:"items"`
		Total int64                  `json:"total"`
	}{
		Items: items,
		Total: total,
	}
	cacheBytes, _ := json.Marshal(resToCache)
	s.rdb.Set(ctx, hashedKey, cacheBytes, cacheTTLSearch)

	return items, total, nil
}

func (s *SearchService) Suggest(ctx context.Context, query string) ([]dto.SuggestResultItem, error) {
	cacheKey := "suggest:" + query
	cached, err := s.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		var items []dto.SuggestResultItem
		if err := json.Unmarshal([]byte(cached), &items); err == nil {
			return items, nil
		}
	}

	var items []dto.SuggestResultItem
	sqlQuery := `
		SELECT id, 'movie' as type, title, slug
		FROM movies
		WHERE title ILIKE '%' || $1 || '%' AND status = 'active'
		UNION ALL
		SELECT id, 'show' as type, title, slug
		FROM shows
		WHERE title ILIKE '%' || $1 || '%' AND status = 'active'
		LIMIT 5
	`
	rows, err := s.db.Query(ctx, sqlQuery, query)
	if err != nil {
		s.log.Error().Err(err).Msg("failed to execute suggest query")
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var item dto.SuggestResultItem
		err := rows.Scan(&item.ID, &item.Type, &item.Title, &item.Slug)
		if err != nil {
			s.log.Error().Err(err).Msg("failed to scan suggest result")
			continue
		}
		items = append(items, item)
	}

	cacheBytes, _ := json.Marshal(items)
	s.rdb.Set(ctx, cacheKey, cacheBytes, cacheTTLSuggest)

	return items, nil
}
