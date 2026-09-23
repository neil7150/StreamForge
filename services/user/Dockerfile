FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY pkg/ pkg/
COPY services/user/ services/user/
WORKDIR /app/services/user
RUN go mod download && CGO_ENABLED=0 go build -o /server ./cmd/server

FROM alpine:3.19
COPY --from=builder /server /server
COPY services/user/db/migrations /db/migrations
EXPOSE 8003
CMD ["/server"]
