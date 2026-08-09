// Package response provides standardized API response helpers for Fiber.
package response

import "github.com/gofiber/fiber/v2"

// APIResponse is the standard JSON envelope for all API responses.
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   *APIError   `json:"error,omitempty"`
	Meta    *Meta       `json:"meta,omitempty"`
}

// APIError contains error details.
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Meta contains pagination info.
type Meta struct {
	Page       int   `json:"page"`
	PerPage    int   `json:"per_page"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

// OK sends a 200 success response.
func OK(c *fiber.Ctx, data interface{}) error {
	return c.JSON(APIResponse{Success: true, Data: data})
}

// Created sends a 201 created response.
func Created(c *fiber.Ctx, data interface{}) error {
	return c.Status(fiber.StatusCreated).JSON(APIResponse{Success: true, Data: data})
}

// Paginated sends a 200 response with pagination metadata.
func Paginated(c *fiber.Ctx, data interface{}, page, perPage int, total int64) error {
	if page < 1 {
		page = 1
	}
	if perPage < 1 {
		perPage = 1
	}
	totalPages := int(total) / perPage
	if int(total)%perPage > 0 {
		totalPages++
	}
	return c.JSON(APIResponse{
		Success: true,
		Data:    data,
		Meta:    &Meta{Page: page, PerPage: perPage, Total: total, TotalPages: totalPages},
	})
}

// Err sends an error response with the given status code.
func Err(c *fiber.Ctx, status int, code, message string) error {
	return c.Status(status).JSON(APIResponse{
		Success: false,
		Error:   &APIError{Code: code, Message: message},
	})
}

// BadRequest sends a 400 error.
func BadRequest(c *fiber.Ctx, message string) error {
	return Err(c, fiber.StatusBadRequest, "BAD_REQUEST", message)
}

// Unauthorized sends a 401 error.
func Unauthorized(c *fiber.Ctx, message string) error {
	return Err(c, fiber.StatusUnauthorized, "UNAUTHORIZED", message)
}

// Forbidden sends a 403 error.
func Forbidden(c *fiber.Ctx, message string) error {
	return Err(c, fiber.StatusForbidden, "FORBIDDEN", message)
}

// NotFound sends a 404 error.
func NotFound(c *fiber.Ctx, message string) error {
	return Err(c, fiber.StatusNotFound, "NOT_FOUND", message)
}

// Conflict sends a 409 error.
func Conflict(c *fiber.Ctx, message string) error {
	return Err(c, fiber.StatusConflict, "CONFLICT", message)
}

// TooManyRequests sends a 429 error.
func TooManyRequests(c *fiber.Ctx, message string) error {
	return Err(c, fiber.StatusTooManyRequests, "TOO_MANY_REQUESTS", message)
}

// InternalError sends a 500 error.
func InternalError(c *fiber.Ctx, message string) error {
	return Err(c, fiber.StatusInternalServerError, "INTERNAL_ERROR", message)
}
