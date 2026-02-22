package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL          string
	ServerPort           string
	Redis                RedisConfig
	Session              SessionConfig
	SMTP                 SMTPConfig
	RateLimit            RateLimitConfig
	PublicURL            string
	ReferralFieldEnabled bool
	MaxMindPath          string
	SessionLogEnabled    bool
}

type RateLimitConfig struct {
	PerMinute int
	PerHour   int
}

type SessionConfig struct {
	Expiry       time.Duration
	TouchMinInterval time.Duration // minimum interval between session touch writes
	MetricsTick  time.Duration     // how often the metrics collector scans Redis
}

type SMTPConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	TLS      string // "none", "starttls", "tls"
	From     string
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

	sessionExpiry := 7 * 24 * time.Hour
	if v := os.Getenv("SESSION_EXPIRY"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("SESSION_EXPIRY must be a valid duration: %w", err)
		}
		sessionExpiry = d
	} else if v := os.Getenv("JWT_REFRESH_EXPIRY"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("JWT_REFRESH_EXPIRY must be a valid duration: %w", err)
		}
		sessionExpiry = d
	}

	metricsTick := 40 * time.Second
	if v := os.Getenv("METRICS_TICK"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("METRICS_TICK must be a valid duration: %w", err)
		}
		metricsTick = d
	}

	touchMinInterval := 20 * time.Second
	if v := os.Getenv("SESSION_TOUCH_INTERVAL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("SESSION_TOUCH_INTERVAL must be a valid duration: %w", err)
		}
		touchMinInterval = d
	}

	publicURL := os.Getenv("PUBLIC_URL")
	if publicURL == "" {
		return nil, fmt.Errorf("PUBLIC_URL environment variable is required")
	}

	referralFieldEnabled := false
	if v := os.Getenv("REFERRAL_FIELD_ENABLED"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("REFERRAL_FIELD_ENABLED must be a boolean: %w", err)
		}
		referralFieldEnabled = b
	}

	sessionLogEnabled := false
	if v := os.Getenv("SESSION_LOG_ENABLED"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("SESSION_LOG_ENABLED must be a boolean: %w", err)
		}
		sessionLogEnabled = b
	}

	rlPerMinute := 5
	if v := os.Getenv("RATE_LIMIT_PER_MINUTE"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("RATE_LIMIT_PER_MINUTE must be an integer: %w", err)
		}
		rlPerMinute = n
	}
	rlPerHour := 20
	if v := os.Getenv("RATE_LIMIT_PER_HOUR"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("RATE_LIMIT_PER_HOUR must be an integer: %w", err)
		}
		rlPerHour = n
	}

	smtpPort := 587
	if v := os.Getenv("SMTP_PORT"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("SMTP_PORT must be an integer: %w", err)
		}
		smtpPort = n
	}

	smtpTLS := os.Getenv("SMTP_TLS")
	if smtpTLS == "" {
		smtpTLS = "starttls"
	}

	return &Config{
		DatabaseURL:          dbURL,
		ServerPort:           port,
		PublicURL:            publicURL,
		ReferralFieldEnabled: referralFieldEnabled,
		SessionLogEnabled:    sessionLogEnabled,
		MaxMindPath:          os.Getenv("MAXMIND_GEOLITE2"),
		Redis: RedisConfig{
			URL:            os.Getenv("REDIS_URL"),
			Password:       os.Getenv("REDIS_PASSWORD"),
			DB:             redisDB,
			SentinelActive: sentinelActive,
			SentinelMaster: os.Getenv("REDIS_SENTINEL_MASTER"),
			SentinelURLs:   sentinelURLs,
		},
		Session: SessionConfig{
			Expiry:           sessionExpiry,
			TouchMinInterval: touchMinInterval,
			MetricsTick:      metricsTick,
		},
		SMTP: SMTPConfig{
			Host:     os.Getenv("SMTP_HOST"),
			Port:     smtpPort,
			User:     os.Getenv("SMTP_USER"),
			Password: os.Getenv("SMTP_PASSWORD"),
			TLS:      smtpTLS,
			From:     os.Getenv("SMTP_FROM"),
		},
		RateLimit: RateLimitConfig{
			PerMinute: rlPerMinute,
			PerHour:   rlPerHour,
		},
	}, nil
}
