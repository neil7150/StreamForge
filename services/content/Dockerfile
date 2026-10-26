FROM golang:1.27.3-alpine AS builder
WORKDIR /build
ENV GOWORK=off CGO_ENABLED=0 GOTOOLCHAIN=local
COPY pkg/ ./pkg/
COPY services/content/ ./services/content/
WORKDIR /build/services/content
RUN go mod download && go build -mod=readonly -trimpath -ldflags="-s -w" -o /server ./cmd/server

FROM alpine:3.23
WORKDIR /app
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 streamforge
COPY --from=builder /server ./server
COPY services/content/db/migrations ./db/migrations
USER streamforge
EXPOSE 8002
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 CMD wget -q --spider http://127.0.0.1:8002/health || exit 1
CMD ["./server"]
