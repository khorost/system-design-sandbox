package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	DatabaseURL string
	ServerPort  string
	Redis       RedisConfig
}

type RedisConfig struct {
	// Standalone mode
	URL      string // host:port
	Password string
	DB       int

	// Sentinel mode
	SentinelActive bool
	SentinelMaster string
	SentinelURLs   []string // []"host:port"
}

func Load() (*Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is required")
	}

	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}

	redisDB := 0
	if v := os.Getenv("REDIS_DB"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("REDIS_DB must be an integer: %w", err)
		}
		redisDB = n
	}

	sentinelActive := false
	if v := os.Getenv("REDIS_SENTINEL_ACTIVE"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("REDIS_SENTINEL_ACTIVE must be a boolean: %w", err)
		}
		sentinelActive = b
	}

	var sentinelURLs []string
	if v := os.Getenv("REDIS_SENTINEL_URL"); v != "" {
		sentinelURLs = strings.Split(v, ",")
	}

	return &Config{
		DatabaseURL: dbURL,
		ServerPort:  port,
		Redis: RedisConfig{
			URL:            os.Getenv("REDIS_URL"),
			Password:       os.Getenv("REDIS_PASSWORD"),
			DB:             redisDB,
			SentinelActive: sentinelActive,
			SentinelMaster: os.Getenv("REDIS_SENTINEL_MASTER"),
			SentinelURLs:   sentinelURLs,
		},
	}, nil
}
