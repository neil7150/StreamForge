// Package logger provides structured logging using zerolog.
package logger

import (
	"os"
	"time"

	"github.com/rs/zerolog"
)

// New creates a zerolog.Logger configured for the given level.
// In development, uses a human-readable console writer.
// In production, uses JSON output.
func New(level string, env string) zerolog.Logger {
	lvl, err := zerolog.ParseLevel(level)
	if err != nil {
		lvl = zerolog.InfoLevel
	}

	zerolog.SetGlobalLevel(lvl)

	if env == "development" {
		return zerolog.New(zerolog.ConsoleWriter{
			Out:        os.Stdout,
			TimeFormat: time.Kitchen,
		}).With().Timestamp().Caller().Logger()
	}

	return zerolog.New(os.Stdout).With().Timestamp().Logger()
}
