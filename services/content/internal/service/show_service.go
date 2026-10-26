package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"streamforge/services/content/internal/model"
	"streamforge/services/content/internal/repository"
)

const (
	cacheTTLShow = 1 * time.Hour
)

const (
	cacheKeyShowBySlug = "content:show:slug:"
	cacheKeyShowByID   = "content:show:id:"
)

type ShowService struct {
	showRepo     *repository.ShowRepository
	genreRepo    *repository.GenreRepository
	magnetRepo   *repository.MagnetRepository
	subtitleRepo *repository.SubtitleRepository
	rdb          *redis.Client
	log          zerolog.Logger
}

func NewShowService(
	showRepo *repository.ShowRepository,
	genreRepo *repository.GenreRepository,
	magnetRepo *repository.MagnetRepository,
	subtitleRepo *repository.SubtitleRepository,
	rdb *redis.Client,
	log zerolog.Logger,
) *ShowService {
	return &ShowService{
		showRepo:     showRepo,
		genreRepo:    genreRepo,
		magnetRepo:   magnetRepo,
		subtitleRepo: subtitleRepo,
		rdb:          rdb,
		log:          log.With().Str("service", "show").Logger(),
	}
}

func (s *ShowService) ListShows(ctx context.Context, page, perPage int, genre, sortBy, sortOrder string) ([]model.Show, int64, error) {
	cacheKey := fmt.Sprintf("shows:list:%d:%d:%s:%s:%s", page, perPage, genre, sortBy, sortOrder)

	if cached, err := s.getShowsListFromCache(ctx, cacheKey); err == nil {
		return cached.Shows, cached.Total, nil
	}

	shows, total, err := s.showRepo.List(ctx, page, perPage, genre, sortBy, sortOrder)
	if err != nil {
		s.log.Error().Err(err).Msg("failed to list shows")
		return nil, 0, err
	}

	for i := range shows {
		genres, err := s.showRepo.GetGenres(ctx, shows[i].ID)
		if err != nil {
			s.log.Warn().Err(err).Str("show_id", shows[i].ID.String()).Msg("failed to load genres for show")
			genres = []model.Genre{}
		}
		shows[i].Genres = genres
	}

	s.cacheShowsList(ctx, cacheKey, shows, total, 5*time.Minute)

	return shows, total, nil
}

func (s *ShowService) GetShow(ctx context.Context, slug string) (model.Show, error) {
	cacheKey := cacheKeyShowBySlug + slug
	if cached, err := s.getShowFromCache(ctx, cacheKey); err == nil && publicShow(cached) {
		s.log.Debug().Str("slug", slug).Msg("show cache hit")
		s.incrementViewCountAsync(cached.ID)
		return cached, nil
	}

	show, err := s.showRepo.GetBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, repository.ErrShowNotFound) {
			return show, ErrNotFound
		}
		s.log.Error().Err(err).Str("slug", slug).Msg("failed to get show")
		return show, err
	}

	if err := s.enrichShow(ctx, &show); err != nil {
		return show, err
	}

	s.incrementViewCountAsync(show.ID)
	s.cacheShow(ctx, cacheKey, show, cacheTTLShow)

	return show, nil
}

func (s *ShowService) CreateShow(ctx context.Context, show model.Show, genreIDs []uuid.UUID) (model.Show, error) {
	show.Slug = generateSlug(show.Title)

	created, err := s.showRepo.Create(ctx, show)
	if err != nil {
		s.log.Error().Err(err).Str("title", show.Title).Msg("failed to create show")
		return created, err
	}

	if len(genreIDs) > 0 {
		if err := s.showRepo.SetGenres(ctx, created.ID, genreIDs); err != nil {
			s.log.Error().Err(err).Msg("failed to set genres for new show")
			return created, err
		}
		genres, _ := s.showRepo.GetGenres(ctx, created.ID)
		created.Genres = genres
	}

	s.invalidateShowsListCache(ctx)
	s.log.Info().Str("id", created.ID.String()).Str("title", created.Title).Msg("show created")
	return created, nil
}

func (s *ShowService) UpdateShow(ctx context.Context, id uuid.UUID, show model.Show, genreIDs []uuid.UUID) (model.Show, error) {
	previous, _ := s.showRepo.GetByID(ctx, id)

	if show.Title != "" {
		show.Slug = generateSlug(show.Title)
	}

	updated, err := s.showRepo.Update(ctx, id, show)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, repository.ErrShowNotFound) {
			return updated, ErrNotFound
		}
		s.log.Error().Err(err).Str("id", id.String()).Msg("failed to update show")
		return updated, err
	}

	if genreIDs != nil {
		if err := s.showRepo.SetGenres(ctx, id, genreIDs); err != nil {
			s.log.Error().Err(err).Msg("failed to update show genres")
			return updated, err
		}
	}

	if err := s.enrichShow(ctx, &updated); err != nil {
		s.log.Warn().Err(err).Msg("failed to enrich updated show")
	}

	s.invalidateShowsListCache(ctx)
	s.rdb.Del(ctx, cacheKeyShowByID+id.String())
	s.rdb.Del(ctx, cacheKeyShowBySlug+updated.Slug)
	if previous.Slug != "" && previous.Slug != updated.Slug {
		s.rdb.Del(ctx, cacheKeyShowBySlug+previous.Slug)
	}

	s.log.Info().Str("id", id.String()).Msg("show updated")
	return updated, nil
}

func (s *ShowService) DeleteShow(ctx context.Context, id uuid.UUID) error {
	show, _ := s.showRepo.GetByID(ctx, id)

	if err := s.showRepo.Delete(ctx, id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, repository.ErrShowNotFound) {
			return ErrNotFound
		}
		s.log.Error().Err(err).Str("id", id.String()).Msg("failed to delete show")
		return err
	}

	s.invalidateShowsListCache(ctx)
	s.rdb.Del(ctx, cacheKeyShowByID+id.String())
	if show.Slug != "" {
		s.rdb.Del(ctx, cacheKeyShowBySlug+show.Slug)
	}

	s.log.Info().Str("id", id.String()).Msg("show deleted")
	return nil
}

func (s *ShowService) GetSeasons(ctx context.Context, showID uuid.UUID) ([]model.Season, error) {
	show, err := s.showRepo.GetByID(ctx, showID)
	if errors.Is(err, repository.ErrShowNotFound) || errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if !publicShow(show) {
		return nil, ErrNotFound
	}
	seasons, err := s.showRepo.GetSeasons(ctx, showID)
	if err != nil {
		return nil, err
	}

	for i := range seasons {
		episodes, err := s.showRepo.GetEpisodes(ctx, seasons[i].ID)
		if err != nil {
			return nil, err
		}
		seasons[i].Episodes = episodes
	}

	return seasons, nil
}

func (s *ShowService) CreateSeason(ctx context.Context, season model.Season) (model.Season, error) {
	created, err := s.showRepo.CreateSeason(ctx, season)
	if err != nil {
		return created, err
	}

	if show, err := s.showRepo.GetByID(ctx, season.ShowID); err == nil && show.Slug != "" {
		s.rdb.Del(ctx, cacheKeyShowBySlug+show.Slug)
		s.rdb.Del(ctx, cacheKeyShowByID+show.ID.String())
	}
	s.invalidateShowsListCache(ctx)

	return created, nil
}

func (s *ShowService) CreateEpisode(ctx context.Context, episode model.Episode) (model.Episode, error) {
	created, err := s.showRepo.CreateEpisode(ctx, episode)
	if err != nil {
		return created, err
	}
	if show, err := s.showRepo.GetByID(ctx, created.ShowID); err == nil {
		s.rdb.Del(ctx, cacheKeyShowBySlug+show.Slug, cacheKeyShowByID+show.ID.String())
	}
	s.invalidateShowsListCache(ctx)
	return created, nil
}

func (s *ShowService) GetEpisodeMagnets(ctx context.Context, episodeID uuid.UUID) ([]model.MagnetLink, error) {
	_, err := s.showRepo.PublicEpisodeShowID(ctx, episodeID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	magnets, err := s.magnetRepo.GetByContent(ctx, "episode", episodeID)
	if err != nil {
		s.log.Error().Err(err).Str("episode_id", episodeID.String()).Msg("failed to get episode magnets")
		return nil, err
	}
	if magnets == nil {
		magnets = []model.MagnetLink{}
	}
	return magnets, nil
}

func (s *ShowService) AddMagnetLink(ctx context.Context, ml model.MagnetLink) (model.MagnetLink, error) {
	created, err := s.magnetRepo.Create(ctx, ml)
	if err != nil {
		s.log.Error().Err(err).Msg("failed to create magnet link")
		return created, err
	}

	s.log.Info().Str("id", created.ID.String()).Str("content_id", ml.ContentID.String()).Msg("magnet link added")
	return created, nil
}

type cachedShowsList struct {
	Shows []model.Show `json:"shows"`
	Total int64        `json:"total"`
}

func (s *ShowService) cacheShowsList(ctx context.Context, key string, shows []model.Show, total int64, ttl time.Duration) {
	data, err := json.Marshal(cachedShowsList{Shows: shows, Total: total})
	if err != nil {
		return
	}
	s.rdb.Set(ctx, key, data, ttl)
}

func (s *ShowService) getShowsListFromCache(ctx context.Context, key string) (cachedShowsList, error) {
	var list cachedShowsList
	data, err := s.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return list, err
	}
	if err := json.Unmarshal(data, &list); err != nil {
		return list, err
	}
	return list, nil
}

func (s *ShowService) invalidateShowsListCache(ctx context.Context) {
	iter := s.rdb.Scan(ctx, 0, "shows:list:*", 0).Iterator()
	for iter.Next(ctx) {
		s.rdb.Del(ctx, iter.Val())
	}
}

func (s *ShowService) incrementViewCountAsync(showID uuid.UUID) {
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.showRepo.IncrementViewCount(bgCtx, showID); err != nil {
			s.log.Warn().Err(err).Str("show_id", showID.String()).Msg("failed to increment view count")
		}
	}()
}

func (s *ShowService) enrichShow(ctx context.Context, show *model.Show) error {
	genres, err := s.showRepo.GetGenres(ctx, show.ID)
	if err != nil {
		return fmt.Errorf("load genres: %w", err)
	}
	show.Genres = genres

	seasons, err := s.showRepo.GetSeasons(ctx, show.ID)
	if err != nil {
		return fmt.Errorf("load seasons: %w", err)
	}

	for i := range seasons {
		episodes, err := s.showRepo.GetEpisodes(ctx, seasons[i].ID)
		if err != nil {
			return err
		}
		seasons[i].Episodes = episodes
	}
	show.Seasons = seasons

	return nil
}

func publicShow(show model.Show) bool {
	return show.Status == "ongoing" || show.Status == "ended" || show.Status == "cancelled"
}

func (s *ShowService) cacheShow(ctx context.Context, key string, show model.Show, ttl time.Duration) {
	data, err := json.Marshal(show)
	if err != nil {
		s.log.Warn().Err(err).Msg("failed to marshal show for cache")
		return
	}
	if err := s.rdb.Set(ctx, key, data, ttl).Err(); err != nil {
		s.log.Warn().Err(err).Msg("failed to cache show")
	}
}

func (s *ShowService) getShowFromCache(ctx context.Context, key string) (model.Show, error) {
	var show model.Show
	data, err := s.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return show, err
	}
	if err := json.Unmarshal(data, &show); err != nil {
		return show, err
	}
	return show, nil
}
