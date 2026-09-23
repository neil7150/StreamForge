module streamforge/services/search

go 1.22

require (
	streamforge.local/pkg v0.0.0
	github.com/gofiber/fiber/v2 v2.52.5
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.7.2
	github.com/redis/go-redis/v9 v9.7.0
	github.com/rs/zerolog v1.33.0
)

replace streamforge.local/pkg => ../../pkg
