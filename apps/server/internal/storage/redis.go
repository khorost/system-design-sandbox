package storage

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/redis/go-redis/v9"
	"github.com/system-design-sandbox/server/internal/config"
)

// slogRedisLogger adapts slog to the go-redis internal logger interface.
type slogRedisLogger struct{}

func (slogRedisLogger) Printf(_ context.Context, format string, v ...interface{}) {
	slog.Debug(fmt.Sprintf(format, v...), "component", "redis")
}

func init() {
	redis.SetLogger(slogRedisLogger{})
}

func NewRedis(ctx context.Context, cfg config.RedisConfig) (redis.UniversalClient, error) {
	if cfg.URL == "" && len(cfg.SentinelURLs) == 0 {
		slog.Info("redis: no REDIS_URL or REDIS_SENTINEL_URL configured, skipping")
		return nil, nil
	}

	var client redis.UniversalClient

	if cfg.SentinelActive {
		if cfg.SentinelMaster == "" {
			return nil, fmt.Errorf("REDIS_SENTINEL_MASTER is required when REDIS_SENTINEL_ACTIVE=true")
		}
		if len(cfg.SentinelURLs) == 0 {
			return nil, fmt.Errorf("REDIS_SENTINEL_URL is required when REDIS_SENTINEL_ACTIVE=true")
		}
		client = redis.NewFailoverClient(&redis.FailoverOptions{
			MasterName:    cfg.SentinelMaster,
			SentinelAddrs: cfg.SentinelURLs,
			Password:      cfg.Password,
			DB:            cfg.DB,
		})
		slog.Info("redis: connecting via sentinel", "master", cfg.SentinelMaster, "sentinels", cfg.SentinelURLs, "db", cfg.DB)
	} else {
		client = redis.NewClient(&redis.Options{
			Addr:     cfg.URL,
			Password: cfg.Password,
			DB:       cfg.DB,
		})
		slog.Info("redis: connecting", "addr", cfg.URL, "db", cfg.DB)
	}

	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("redis ping failed: %w", err)
	}

	slog.Info("redis: connected")
	return client, nil
}
