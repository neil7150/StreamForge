package handler

import (
	"errors"
	"strconv"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"streamforge.local/pkg/response"
	"streamforge/services/content/internal/dto"
	"streamforge/services/content/internal/model"
	"streamforge/services/content/internal/service"
)

type ShowHandler struct {
	svc      *service.ShowService
	log      zerolog.Logger
	validate *validator.Validate
}

func NewShowHandler(svc *service.ShowService, log zerolog.Logger) *ShowHandler {
	return &ShowHandler{svc: svc, log: log, validate: validator.New()}
}

func (h *ShowHandler) ListShows(c *fiber.Ctx) error {
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

	shows, total, err := h.svc.ListShows(c.Context(), page, perPage, genre, sortBy, sortOrder)
	if err != nil {
		h.log.Error().Err(err).Msg("Failed to list shows")
		return response.InternalError(c, "Failed to fetch shows")
	}

	results := make([]dto.ShowResponse, len(shows))
	for i, s := range shows {
		results[i] = dto.ToShowResponse(s)
	}

	return response.Paginated(c, results, page, perPage, total)
}

func (h *ShowHandler) GetShow(c *fiber.Ctx) error {
	slug := c.Params("slug")
	if slug == "" {
		return response.BadRequest(c, "Show slug is required")
	}

	show, err := h.svc.GetShow(c.Context(), slug)
	if err != nil {
		h.log.Error().Err(err).Str("slug", slug).Msg("Failed to get show")
		if errors.Is(err, service.ErrNotFound) {
			return response.NotFound(c, "Show not found")
		}
		return response.InternalError(c, "Failed to fetch show")
	}

	return response.OK(c, dto.ToShowDetailResponse(show))
}

func (h *ShowHandler) GetSeasons(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "Invalid show ID")
	}

	seasons, err := h.svc.GetSeasons(c.Context(), id)
	if err != nil {
		h.log.Error().Err(err).Str("show_id", id.String()).Msg("Failed to get seasons")
		if errors.Is(err, service.ErrNotFound) {
			return response.NotFound(c, "Content not found")
		}
		return response.InternalError(c, "Failed to fetch seasons")
	}

	results := make([]dto.SeasonResponse, len(seasons))
	for i, s := range seasons {
		results[i] = dto.ToSeasonResponse(s)
	}

	return response.OK(c, results)
}

func (h *ShowHandler) GetEpisodeMagnets(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "Invalid episode ID")
	}

	magnets, err := h.svc.GetEpisodeMagnets(c.Context(), id)
	if err != nil {
		h.log.Error().Err(err).Str("id", id.String()).Msg("Failed to get episode magnets")
		if errors.Is(err, service.ErrNotFound) {
			return response.NotFound(c, "Content not found")
		}
		return response.InternalError(c, "Failed to fetch magnets")
	}

	results := make([]dto.MagnetLinkResponse, len(magnets))
	for i, m := range magnets {
		results[i] = dto.ToMagnetLinkResponse(m)
	}

	return response.OK(c, results)
}

// ── Admin handlers ──────────────────────────────────────

func (h *ShowHandler) CreateShow(c *fiber.Ctx) error {
	var req dto.CreateShowRequest
	if err := c.BodyParser(&req); err != nil {
		return response.BadRequest(c, "Invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return response.BadRequest(c, "Invalid show data")
	}

	firstAirDate, err := parseOptionalDate(req.FirstAirDate)
	if err != nil {
		return response.BadRequest(c, "First air date must use YYYY-MM-DD format")
	}
	lastAirDate, err := parseOptionalDate(req.LastAirDate)
	if err != nil {
		return response.BadRequest(c, "Last air date must use YYYY-MM-DD format")
	}

	show := model.Show{
		Title:        req.Title,
		Overview:     req.Overview,
		FirstAirDate: firstAirDate,
		LastAirDate:  lastAirDate,
		Language:     req.Language,
		PosterURL:    req.PosterURL,
		BackdropURL:  req.BackdropURL,
		LicenseType:  req.LicenseType,
		LicenseURL:   req.LicenseURL,
	}

	result, err := h.svc.CreateShow(c.Context(), show, req.GenreIDs)
	if err != nil {
		h.log.Error().Err(err).Msg("Failed to create show")
		return response.InternalError(c, "Failed to create show")
	}

	return response.Created(c, dto.ToShowDetailResponse(result))
}

func (h *ShowHandler) UpdateShow(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "Invalid show ID")
	}

	var req dto.CreateShowRequest
	if err := c.BodyParser(&req); err != nil {
		return response.BadRequest(c, "Invalid request body")
	}

	firstAirDate, _ := parseOptionalDate(req.FirstAirDate)
	lastAirDate, _ := parseOptionalDate(req.LastAirDate)

	show := model.Show{
		Title:        req.Title,
		Overview:     req.Overview,
		FirstAirDate: firstAirDate,
		LastAirDate:  lastAirDate,
		Language:     req.Language,
		PosterURL:    req.PosterURL,
		BackdropURL:  req.BackdropURL,
		LicenseType:  req.LicenseType,
		LicenseURL:   req.LicenseURL,
	}

	result, err := h.svc.UpdateShow(c.Context(), id, show, req.GenreIDs)
	if err != nil {
		h.log.Error().Err(err).Str("id", id.String()).Msg("Failed to update show")
		return response.InternalError(c, "Failed to update show")
	}

	return response.OK(c, dto.ToShowDetailResponse(result))
}

func (h *ShowHandler) DeleteShow(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "Invalid show ID")
	}

	if err := h.svc.DeleteShow(c.Context(), id); err != nil {
		h.log.Error().Err(err).Str("id", id.String()).Msg("Failed to delete show")
		return response.InternalError(c, "Failed to delete show")
	}

	return response.OK(c, fiber.Map{"deleted": true})
}

func (h *ShowHandler) CreateSeason(c *fiber.Ctx) error {
	showID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "Invalid show ID")
	}

	var req model.Season
	if err := c.BodyParser(&req); err != nil {
		return response.BadRequest(c, "Invalid request body")
	}
	if req.SeasonNumber < 1 {
		return response.BadRequest(c, "Season number must be positive")
	}
	req.ShowID = showID

	result, err := h.svc.CreateSeason(c.Context(), req)
	if err != nil {
		h.log.Error().Err(err).Msg("Failed to create season")
		return response.InternalError(c, "Failed to create season")
	}

	return response.Created(c, dto.ToSeasonResponse(result))
}

func (h *ShowHandler) CreateEpisode(c *fiber.Ctx) error {
	var req dto.CreateEpisodeRequest
	if err := c.BodyParser(&req); err != nil {
		return response.BadRequest(c, "Invalid request body")
	}

	if err := h.validate.Struct(req); err != nil {
		return response.BadRequest(c, "Invalid episode data")
	}
	airDate, err := parseOptionalDate(req.AirDate)
	if err != nil {
		return response.BadRequest(c, "Air date must use YYYY-MM-DD format")
	}

	episode := model.Episode{
		SeasonID:       req.SeasonID,
		EpisodeNumber:  req.EpisodeNumber,
		Title:          req.Title,
		Overview:       req.Overview,
		RuntimeMinutes: req.RuntimeMinutes,
		AirDate:        airDate,
		StillURL:       req.StillURL,
	}

	result, err := h.svc.CreateEpisode(c.Context(), episode)
	if err != nil {
		h.log.Error().Err(err).Msg("Failed to create episode")
		return response.InternalError(c, "Failed to create episode")
	}

	return response.Created(c, dto.ToEpisodeResponse(result))
}

func (h *ShowHandler) AddEpisodeMagnet(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "Invalid episode ID")
	}

	var req dto.CreateMagnetRequest
	if err := c.BodyParser(&req); err != nil {
		return response.BadRequest(c, "Invalid request body")
	}
	req.ContentType = "episode"
	req.ContentID = id
	if err := h.validate.Struct(req); err != nil {
		return response.BadRequest(c, "Invalid magnet data")
	}

	ml := model.MagnetLink{
		ContentType:   "episode",
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
		h.log.Error().Err(err).Msg("Failed to add episode magnet")
		return response.InternalError(c, "Failed to add magnet link")
	}

	return response.Created(c, dto.ToMagnetLinkResponse(magnet))
}
