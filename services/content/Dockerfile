# Content Service
FROM golang:1.22-alpine AS builder
WORKDIR /build
COPY pkg/ ./pkg/
COPY services/auth/ ./services/auth/
COPY services/content/ ./services/content/
COPY go.work ./
RUN cd services/content && go build -o /app/server ./cmd/server

FROM alpine:3.19
WORKDIR /app
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/server /app/server
COPY services/content/db/migrations /app/db/migrations
EXPOSE 8002
CMD ["./server"]
