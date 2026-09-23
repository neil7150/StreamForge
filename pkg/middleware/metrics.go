package middleware

import (
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gofiber/fiber/v2"
)

type metricsCollector struct {
	mu            sync.RWMutex
	service       string
	inFlight      int64
	totalRequests uint64
	statusCounts  map[string]uint64
	durationsSum  float64
	durationsCnt  uint64
}

var (
	collectors   = make(map[string]*metricsCollector)
	collectorsMu sync.Mutex
)

// RegisterMetrics registers live Prometheus metrics middleware and /metrics endpoint on app.
func RegisterMetrics(app *fiber.App, serviceName string) {
	collectorsMu.Lock()
	collector, exists := collectors[serviceName]
	if !exists {
		collector = &metricsCollector{
			service:      serviceName,
			statusCounts: make(map[string]uint64),
		}
		collectors[serviceName] = collector
	}
	collectorsMu.Unlock()

	// Metrics tracking middleware
	app.Use(func(c *fiber.Ctx) error {
		if c.Path() == "/metrics" || c.Path() == "/health" {
			return c.Next()
		}

		atomic.AddInt64(&collector.inFlight, 1)
		start := time.Now()

		err := c.Next()

		duration := time.Since(start).Seconds()
		atomic.AddInt64(&collector.inFlight, -1)
		atomic.AddUint64(&collector.totalRequests, 1)

		statusCode := c.Response().StatusCode()
		key := fmt.Sprintf("%s_%s_%d", serviceName, c.Method(), statusCode)

		collector.mu.Lock()
		collector.statusCounts[key]++
		collector.durationsSum += duration
		collector.durationsCnt++
		collector.mu.Unlock()

		return err
	})

	// /metrics handler
	app.Get("/metrics", func(c *fiber.Ctx) error {
		collector.mu.RLock()
		defer collector.mu.RUnlock()

		var b strings.Builder
		b.WriteString("# HELP streamforge_up Whether the service is running.\n")
		b.WriteString("# TYPE streamforge_up gauge\n")
		b.WriteString(fmt.Sprintf("streamforge_up{service=\"%s\"} 1\n\n", serviceName))

		b.WriteString("# HELP http_requests_in_flight Number of in-flight HTTP requests.\n")
		b.WriteString("# TYPE http_requests_in_flight gauge\n")
		b.WriteString(fmt.Sprintf("http_requests_in_flight{service=\"%s\"} %d\n\n", serviceName, atomic.LoadInt64(&collector.inFlight)))

		b.WriteString("# HELP http_requests_total Total number of HTTP requests made.\n")
		b.WriteString("# TYPE http_requests_total counter\n")
		for key, count := range collector.statusCounts {
			parts := strings.Split(key, "_")
			if len(parts) >= 3 {
				svc := parts[0]
				method := parts[1]
				status := parts[2]
				b.WriteString(fmt.Sprintf("http_requests_total{service=\"%s\",method=\"%s\",status=\"%s\"} %d\n", svc, method, status, count))
			}
		}

		b.WriteString("\n# HELP http_request_duration_seconds_sum Total seconds spent in HTTP requests.\n")
		b.WriteString("# TYPE http_request_duration_seconds_sum counter\n")
		b.WriteString(fmt.Sprintf("http_request_duration_seconds_sum{service=\"%s\"} %f\n", serviceName, collector.durationsSum))

		b.WriteString("# HELP http_request_duration_seconds_count Total count of recorded request durations.\n")
		b.WriteString("# TYPE http_request_duration_seconds_count counter\n")
		b.WriteString(fmt.Sprintf("http_request_duration_seconds_count{service=\"%s\"} %d\n", serviceName, collector.durationsCnt))

		c.Type("txt", "utf-8")
		return c.SendString(b.String())
	})
}
