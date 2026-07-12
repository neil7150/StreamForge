package handler

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"streamforge/pkg/response"
	"streamforge/services/content/internal/dto"
	"streamforge/services/content/internal/model"
	"streamforge/services/content/internal/service"
)

// MovieHandler handles HTTP requests for movies.
type MovieHandler struct {
	svc *service.ContentService
	log zerolog.Logger
}

// NewMovieHandler creates a new MovieHandler.
func NewMovieHandler(svc *service.ContentService, log zerolog.Logger) *MovieHandler {
	return &MovieHandler{svc: svc, log: log}
}

// ListMovies handles GET /api/v1/movies
func (h *MovieHandler) ListMovies(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	perPage, _ := strconv.Atoi(c.Query("per_page", "20"))
	genre := c.Query("genre")
	sortBy := c.Query("sort_by", "created_at")
	sortOrder := c.Query("sort_order", "desc")

	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}

	movies, total, err := h.svc.ListMovies(c.Context(), page, perPage, genre, sortBy, sortOrder)
	if err != nil {
		h.log.Error().Err(err).Msg("Failed to list movies")
		return response.InternalError(c, "Failed to fetch movies")
	}

	results := make([]dto.MovieResponse, len(movies))
	for i, m := range movies {
		results[i] = dto.ToMovieResponse(m, len(m.MagnetLinks))
	}

	return response.Paginated(c, results, page, perPage, total)
}

// GetMovie handles GET /api/v1/movies/:slug
func (h *MovieHandler) GetMovie(c *fiber.Ctx) error {
	slug := c.Params("slug")
	if slug == "" {
		return response.BadRequest(c, "Movie slug is required")
	}

	movie, err := h.svc.GetMovie(c.Context(), slug)
	if err != nil {
		h.log.Error().Err(err).Str("slug", slug).Msg("Failed to get movie")
		return response.NotFound(c, "Movie not found")
	}

	return response.OK(c, dto.ToMovieDetailResponse(movie))
}

// GetMovieMagnets handles GET /api/v1/movies/:id/magnets
func (h *MovieHandler) GetMovieMagnets(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "Invalid movie ID")
	}

	magnets, err := h.svc.GetMovieMagnets(c.Context(), id)
	if err != nil {
		h.log.Error().Err(err).Str("id", id.String()).Msg("Failed to get magnets")
		return response.InternalError(c, "Failed to fetch magnets")
	}

	results := make([]dto.MagnetLinkResponse, len(magnets))
	for i, m := range magnets {
		results[i] = dto.ToMagnetLinkResponse(m)
	}

	return response.OK(c, results)
}

// GetMovieSubtitles handles GET /api/v1/movies/:id/subtitles
func (h *MovieHandler) GetMovieSubtitles(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "Invalid movie ID")
	}

	subs, err := h.svc.GetMovieSubtitles(c.Context(), id)
	if err != nil {
		h.log.Error().Err(err).Str("id", id.String()).Msg("Failed to get subtitles")
		return response.InternalError(c, "Failed to fetch subtitles")
	}

	results := make([]dto.SubtitleResponse, len(subs))
	for i, s := range subs {
		results[i] = dto.ToSubtitleResponse(s)
	}

	return response.OK(c, results)
}

// GetTrending handles GET /api/v1/movies/trending
func (h *MovieHandler) GetTrending(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if limit < 1 || limit > 50 {
		limit = 20
	}

	movies, err := h.svc.GetTrending(c.Context(), limit)
	if err != nil {
		h.log.Error().Err(err).Msg("Failed to get trending")
		return response.InternalError(c, "Failed to fetch trending movies")
	}

	results := make([]dto.MovieResponse, len(movies))
	for i, m := range movies {
		results[i] = dto.ToMovieResponse(m, len(m.MagnetLinks))
	}

	return response.OK(c, results)
}

// GetRecent handles GET /api/v1/movies/recent
func (h *MovieHandler) GetRecent(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if limit < 1 || limit > 50 {
		limit = 20
	}

	movies, err := h.svc.GetRecent(c.Context(), limit)
	if err != nil {
		h.log.Error().Err(err).Msg("Failed to get recent")
		return response.InternalError(c, "Failed to fetch recent movies")
	}

	results := make([]dto.MovieResponse, len(movies))
	for i, m := range movies {
		results[i] = dto.ToMovieResponse(m, len(m.MagnetLinks))
	}

	return response.OK(c, results)
}

// ── Admin handlers ──────────────────────────────────────

// CreateMovie handles POST /api/v1/admin/movies
func (h *MovieHandler) CreateMovie(c *fiber.Ctx) error {
	var req dto.CreateMovieRequest
	if err := c.BodyParser(&req); err != nil {
		return response.BadRequest(c, "Invalid request body")
	}

	movie := model.Movie{
		Title:          req.Title,
		Overview:       req.Overview,
		Tagline:        req.Tagline,
		RuntimeMinutes: req.RuntimeMinutes,
		Language:       req.Language,
		PosterURL:      req.PosterURL,
		BackdropURL:    req.BackdropURL,
		TrailerURL:     req.TrailerURL,
		ImdbID:         req.ImdbID,
		ContentRating:  req.ContentRating,
		LicenseType:    req.LicenseType,
		LicenseURL:     req.LicenseURL,
	}

	result, err := h.svc.CreateMovie(c.Context(), movie, req.GenreIDs)
	if err != nil {
		h.log.Error().Err(err).Msg("Failed to create movie")
		return response.InternalError(c, "Failed to create movie")
	}

	return response.Created(c, dto.ToMovieDetailResponse(result))
}

// UpdateMovie handles PUT /api/v1/admin/movies/:id
func (h *MovieHandler) UpdateMovie(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "Invalid movie ID")
	}

	var req dto.CreateMovieRequest
	if err := c.BodyParser(&req); err != nil {
		return response.BadRequest(c, "Invalid request body")
	}

	movie := model.Movie{
		Title:          req.Title,
		Overview:       req.Overview,
		Tagline:        req.Tagline,
		RuntimeMinutes: req.RuntimeMinutes,
		Language:       req.Language,
		PosterURL:      req.PosterURL,
		BackdropURL:    req.BackdropURL,
		TrailerURL:     req.TrailerURL,
		ImdbID:         req.ImdbID,
		ContentRating:  req.ContentRating,
		LicenseType:    req.LicenseType,
		LicenseURL:     req.LicenseURL,
	}

	result, err := h.svc.UpdateMovie(c.Context(), id, movie, req.GenreIDs)
	if err != nil {
		h.log.Error().Err(err).Str("id", id.String()).Msg("Failed to update movie")
		return response.InternalError(c, "Failed to update movie")
	}

	return response.OK(c, dto.ToMovieDetailResponse(result))
}

// DeleteMovie handles DELETE /api/v1/admin/movies/:id
func (h *MovieHandler) DeleteMovie(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "Invalid movie ID")
	}

	if err := h.svc.DeleteMovie(c.Context(), id); err != nil {
		h.log.Error().Err(err).Str("id", id.String()).Msg("Failed to delete movie")
		return response.InternalError(c, "Failed to delete movie")
	}

	return response.OK(c, fiber.Map{"deleted": true})
}

// AddMagnet handles POST /api/v1/admin/movies/:id/magnets
func (h *MovieHandler) AddMagnet(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "Invalid movie ID")
	}

	var req dto.CreateMagnetRequest
	if err := c.BodyParser(&req); err != nil {
		return response.BadRequest(c, "Invalid request body")
	}

	ml := model.MagnetLink{
		ContentType:   "movie",
		ContentID:     id,
		MagnetURI:     req.MagnetURI,
		InfoHash:      req.InfoHash,
		Quality:       req.Quality,
		Codec:         req.Codec,
		FileSizeBytes: req.FileSizeBytes,
		Source:        req.Source,
	}

	magnet, err := h.svc.AddMagnetLink(c.Context(), ml)
	if err != nil {
		h.log.Error().Err(err).Msg("Failed to add magnet")
		return response.InternalError(c, "Failed to add magnet link")
	}

	return response.Created(c, dto.ToMagnetLinkResponse(magnet))
}
