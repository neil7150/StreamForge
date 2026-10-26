package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/rs/zerolog"
	"streamforge/services/api/app"
)

func main() {
	log := zerolog.New(os.Stdout).With().Timestamp().Logger()
	// Botkeep may deliver Environment values through a .env file. Existing process
	// variables take precedence; never execute that file as a shell script.
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Error().Msg("Invalid .env file")
		os.Exit(1)
	}
	if err := run(log); err != nil {
		log.Error().Err(err).Msg("API stopped")
		os.Exit(1)
	}
}

func run(log zerolog.Logger) error {
	cfg, err := app.LoadConfig()
	if err != nil {
		return err
	}
	startup, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	stores, err := app.OpenStores(startup, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer stores.Close()
	authRedis, err := app.OpenRedis(startup, cfg.AuthRedisURL, cfg.AuthRedisCAFile)
	if err != nil {
		return err
	}
	defer authRedis.Close()
	cacheRedis, err := app.OpenRedis(startup, cfg.CacheRedisURL, cfg.CacheRedisCAFile)
	if err != nil {
		return err
	}
	defer cacheRedis.Close()
	if err := app.VerifyAuthRedisPolicy(startup, authRedis, cfg); err != nil {
		return err
	}
	if cfg.AuthRedisPolicyMode == "botkeep-staff-confirmed" {
		log.Warn().Msg("Authentication Redis policy relies on recorded Botkeep staff confirmation; CONFIG/INFO are not verified live. Monitor memory, disk and persistence through the provider.")
	}
	server := &http.Server{Addr: "0.0.0.0:" + cfg.Port, Handler: app.NewHandler(stores, authRedis, cacheRedis, cfg.Auth, log, app.DefaultLimits), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	stopping, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ended := make(chan error, 1)
	go func() {
		log.Info().Str("port", cfg.Port).Msg("Compact API listening")
		ended <- server.ListenAndServe()
	}()
	select {
	case err := <-ended:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-stopping.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			server.Close()
			return err
		}
		return nil
	}
}
