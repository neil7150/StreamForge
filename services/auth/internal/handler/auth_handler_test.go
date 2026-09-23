package handler

import (
	"errors"
	"testing"

	"github.com/go-playground/validator/v10"
	"streamforge/services/auth/internal/dto"
)

func TestFormatValidationErrors(t *testing.T) {
	validate := validator.New()

	type TestStruct struct {
		ReqStr string `validate:"required"`
		Email  string `validate:"email"`
		MinLen string `validate:"min=5"`
		MaxLen string `validate:"max=5"`
		Other  int    `validate:"gt=10"`
	}

	tests := []struct {
		name     string
		input    TestStruct
		expected string
	}{
		{
			name: "required error",
			input: TestStruct{
				Email:  "test@test.com",
				MinLen: "12345",
				MaxLen: "123",
				Other:  11,
			},
			expected: "ReqStr is required",
		},
		{
			name: "email error",
			input: TestStruct{
				ReqStr: "a",
				Email:  "notanemail",
				MinLen: "12345",
				MaxLen: "123",
				Other:  11,
			},
			expected: "Email must be a valid email address",
		},
		{
			name: "min error",
			input: TestStruct{
				ReqStr: "a",
				Email:  "test@test.com",
				MinLen: "123",
				MaxLen: "123",
				Other:  11,
			},
			expected: "MinLen must be at least 5 characters",
		},
		{
			name: "max error",
			input: TestStruct{
				ReqStr: "a",
				Email:  "test@test.com",
				MinLen: "12345",
				MaxLen: "123456",
				Other:  11,
			},
			expected: "MaxLen must be at most 5 characters",
		},
		{
			name: "other error",
			input: TestStruct{
				ReqStr: "a",
				Email:  "test@test.com",
				MinLen: "12345",
				MaxLen: "123",
				Other:  5,
			},
			expected: "Other failed validation: gt",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validate.Struct(tt.input)
			if err == nil {
				t.Fatalf("expected validation error, got none")
			}
			
			result := formatValidationErrors(err)
			
			if result != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, result)
			}
		})
	}

	t.Run("multiple errors", func(t *testing.T) {
		input := TestStruct{
			Email: "notanemail",
		}
		err := validate.Struct(input)
		if err == nil {
			t.Fatalf("expected validation error, got none")
		}
		result := formatValidationErrors(err)
		if result == "" || result == "Validation failed" {
			t.Errorf("got empty or default error message: %s", result)
		}
	})

	t.Run("non validation error", func(t *testing.T) {
		err := errors.New("some other error")
		result := formatValidationErrors(err)
		if result != "Validation failed" {
			t.Errorf("expected 'Validation failed', got %q", result)
		}
	})
}

func TestDTOValidation(t *testing.T) {
	validate := validator.New()

	t.Run("RegisterRequest", func(t *testing.T) {
		validReq := dto.RegisterRequest{
			Email:       "test@example.com",
			Password:    "password123",
			DisplayName: "Test User",
		}
		if err := validate.Struct(validReq); err != nil {
			t.Errorf("expected valid RegisterRequest to pass: %v", err)
		}

		invalidReq := dto.RegisterRequest{
			Email:    "notanemail",
			Password: "short",
		}
		if err := validate.Struct(invalidReq); err == nil {
			t.Errorf("expected invalid RegisterRequest to fail")
		}
	})

	t.Run("LoginRequest", func(t *testing.T) {
		validReq := dto.LoginRequest{
			Email:    "test@example.com",
			Password: "password",
		}
		if err := validate.Struct(validReq); err != nil {
			t.Errorf("expected valid LoginRequest to pass: %v", err)
		}

		invalidReq := dto.LoginRequest{
			Email: "test",
		}
		if err := validate.Struct(invalidReq); err == nil {
			t.Errorf("expected invalid LoginRequest to fail")
		}
	})

	t.Run("RefreshRequest", func(t *testing.T) {
		validReq := dto.RefreshRequest{
			RefreshToken: "token123",
		}
		if err := validate.Struct(validReq); err != nil {
			t.Errorf("expected valid RefreshRequest to pass: %v", err)
		}

		invalidReq := dto.RefreshRequest{}
		if err := validate.Struct(invalidReq); err == nil {
			t.Errorf("expected invalid RefreshRequest to fail")
		}
	})
}
