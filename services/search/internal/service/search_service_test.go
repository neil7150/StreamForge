package service

import (
	"testing"

	"github.com/rs/zerolog"
)

func TestNewSearchService(t *testing.T) {
	log := zerolog.Nop()
	
	svc := NewSearchService(nil, nil, log)
	if svc == nil {
		t.Error("Expected SearchService to be created")
	}
}
