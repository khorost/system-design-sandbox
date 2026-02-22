FROM golang:1.26-alpine AS builder
ARG VERSION=dev
ARG COMMIT=unknown
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags "-X main.Version=${VERSION} -X main.Commit=${COMMIT}" -o /server ./cmd/server

FROM alpine:3.23.3
RUN apk add --no-cache ca-certificates
COPY --from=builder /server /server
COPY --from=builder /app/migrations/ /migrations/
EXPOSE 8080
CMD ["/server"]
