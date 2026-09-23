package service

import (
	"testing"
	"streamforge/services/user/internal/repository"
)

func TestNewProfileService(t *testing.T) {
	svc := NewProfileService(&repository.ProfileRepository{})
	if svc == nil {
		t.Error("Expected non-nil service")
	}
}
