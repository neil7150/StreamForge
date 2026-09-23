package service

import (
	"testing"
	"streamforge/services/user/internal/repository"
)

func TestNewSyncService(t *testing.T) {
	svc := NewSyncService(&repository.SyncRepository{})
	if svc == nil {
		t.Error("Expected non-nil service")
	}
}
