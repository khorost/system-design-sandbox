package storage

import (
	"context"
	"fmt"
	"log"

	"github.com/redis/go-redis/v9"
	"github.com/system-design-sandbox/server/internal/config"
)

func NewRedis(ctx context.Context, cfg config.RedisConfig) (redis.UniversalClient, error) {
	if cfg.URL == "" && len(cfg.SentinelURLs) == 0 {
		log.Println("redis: no REDIS_URL or REDIS_SENTINEL_URL configured, skipping")
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
		log.Printf("redis: connecting via sentinel (master=%s, sentinels=%v, db=%d)", cfg.SentinelMaster, cfg.SentinelURLs, cfg.DB)
	} else {
		client = redis.NewClient(&redis.Options{
			Addr:     cfg.URL,
			Password: cfg.Password,
			DB:       cfg.DB,
		})
		log.Printf("redis: connecting to %s (db=%d)", cfg.URL, cfg.DB)
	}

	if err := client.Ping(ctx).Err(); err != nil {
		client.Close()
		return nil, fmt.Errorf("redis ping failed: %w", err)
	}

	log.Println("redis: connected")
	return client, nil
}
