FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY pkg/ pkg/
COPY services/search/ services/search/
WORKDIR /app/services/search
RUN go mod download && CGO_ENABLED=0 go build -o /server ./cmd/server

FROM alpine:3.19
COPY --from=builder /server /server
EXPOSE 8004
CMD ["/server"]
