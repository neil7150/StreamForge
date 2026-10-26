FROM golang:1.27.3-alpine AS builder
WORKDIR /build
ENV GOWORK=off CGO_ENABLED=0 GOTOOLCHAIN=local
COPY pkg/ ./pkg/
COPY services/auth/ ./services/auth/
WORKDIR /build/services/auth
RUN go mod download && go build -mod=readonly -trimpath -ldflags="-s -w" -o /server ./cmd/server

FROM alpine:3.23
WORKDIR /app
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 streamforge
COPY --from=builder /server ./server
COPY services/auth/db/migrations ./db/migrations
USER streamforge
EXPOSE 8001
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 CMD wget -q --spider http://127.0.0.1:8001/health || exit 1
CMD ["./server"]
