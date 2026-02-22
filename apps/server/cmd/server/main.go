package main

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/pressly/goose/v3"
	"github.com/system-design-sandbox/server/internal/auth"
	"github.com/system-design-sandbox/server/internal/config"
	"github.com/system-design-sandbox/server/internal/geoip"
	"github.com/system-design-sandbox/server/internal/handler"
	"github.com/system-design-sandbox/server/internal/metrics"
	"github.com/system-design-sandbox/server/internal/storage"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func parseLogLevel(s string) slog.Level {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "DEBUG":
		return slog.LevelDebug
	case "WARN", "WARNING":
		return slog.LevelWarn
	case "ERROR":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func main() {
	if err := godotenv.Load(); err != nil {
		slog.Info("no .env file found, using environment variables")
	}

	// Configure logger
	logLevel := parseLogLevel(os.Getenv("LOG_LEVEL"))
	logStruct := strings.EqualFold(strings.TrimSpace(os.Getenv("LOG_STRUCT")), "true")
	handlerOpts := &slog.HandlerOptions{
		Level: logLevel,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if a.Key == slog.TimeKey {
				a.Value = slog.StringValue(a.Value.Time().Format("2006-01-02T15:04:05.000Z07:00"))
			}
			return a
		},
	}
	var logHandler slog.Handler
	if logStruct {
		logHandler = slog.NewJSONHandler(os.Stdout, handlerOpts)
	} else {
		logHandler = slog.NewTextHandler(os.Stdout, handlerOpts)
	}
	slog.SetDefault(slog.New(logHandler))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Run migrations
	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to open db for migrations", "error", err)
		os.Exit(1)
	}
	if err := goose.SetDialect("postgres"); err != nil {
		slog.Error("failed to set goose dialect", "error", err)
		os.Exit(1)
	}
	if err := goose.Up(db, "migrations"); err != nil {
		slog.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}
	db.Close()

	// Connect via pgxpool
	store, err := storage.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	// Connect to Redis (optional)
	rdb, err := storage.NewRedis(ctx, cfg.Redis)
	if err != nil {
		slog.Error("failed to connect to redis", "error", err)
		os.Exit(1)
	}
	store.Redis = rdb

	// Initialize auth services
	var redisAuth *auth.RedisAuth
	if rdb != nil {
		redisAuth = auth.NewRedisAuth(rdb, cfg.Session.Expiry, cfg.Session.TouchMinInterval, cfg.RateLimit.PerMinute, cfg.RateLimit.PerHour)
	}
	emailSender := auth.NewEmailSender(cfg.SMTP)

	geo, err := geoip.Open(cfg.MaxMindPath)
	if err != nil {
		slog.Warn("geoip disabled: failed to open database", "error", err)
	}
	if geo != nil {
		defer geo.Close()
	}

	// Metrics: hub first (collector depends on it)
	hub := metrics.NewHub(15 * time.Second)
	collector := metrics.NewCollector(rdb, hub, 5*time.Minute)
	collector.SetOnSnapshot(hub.Broadcast)

	metricsCtx, metricsCancel := context.WithCancel(context.Background())
	defer metricsCancel()
	go collector.Run(metricsCtx, cfg.Session.MetricsTick)

	router := handler.NewRouter(cfg, store, redisAuth, emailSender, geo, collector, hub)

	srv := &http.Server{
		Addr:              ":" + cfg.ServerPort,
		Handler:           router,
		ReadHeaderTimeout: 15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// Graceful shutdown
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGTERM)

	go func() {
		slog.Info("server starting", "port", cfg.ServerPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-done
	slog.Info("shutting down server")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("server shutdown error", "error", err)
		os.Exit(1)
	}

	slog.Info("server stopped")
}
