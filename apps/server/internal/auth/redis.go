package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	authTokenTTL    = 5 * time.Minute
	rateLimitMinTTL = 60 * time.Second
	rateLimitMinMax = 1
	rateLimitHrTTL  = 3600 * time.Second
	rateLimitHrMax  = 5
	maxCodeAttempts = 5
)

// AuthTokenData is the data stored in Redis for a pending auth token.
type AuthTokenData struct {
	Code     string `json:"code"`
	Email    string `json:"email"`
	Attempts int    `json:"attempts"`
}

// SessionData is the data stored in Redis for an active session.
type SessionData struct {
	UserID       string `json:"user_id"`
	RefreshToken string `json:"refresh_token"`
	IP           string `json:"ip"`
	UserAgent    string `json:"ua"`
	Geo          string `json:"geo"`
	CreatedAt    string `json:"created_at"`
	LastActiveAt string `json:"last_active_at"`
}

// RedisAuth provides auth-related Redis operations.
type RedisAuth struct {
	rdb           redis.UniversalClient
	sessionExpiry time.Duration
}

// NewRedisAuth creates a new RedisAuth instance.
func NewRedisAuth(rdb redis.UniversalClient, sessionExpiry time.Duration) *RedisAuth {
	return &RedisAuth{rdb: rdb, sessionExpiry: sessionExpiry}
}

// --- Auth token operations ---

func authTokenKey(token string) string    { return "auth:" + token }
func authCodeKey(email, code string) string { return "auth:code:" + email + ":" + code }
func rateLimitMinKey(email string) string { return "auth:rl:" + email + ":min" }
func rateLimitHrKey(email string) string  { return "auth:rl:" + email + ":hour" }

// SaveAuthToken stores the auth token and code index in Redis.
func (ra *RedisAuth) SaveAuthToken(ctx context.Context, token, code, email string) error {
	data := AuthTokenData{Code: code, Email: email, Attempts: 0}
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	pipe := ra.rdb.Pipeline()
	pipe.Set(ctx, authTokenKey(token), b, authTokenTTL)
	pipe.Set(ctx, authCodeKey(email, NormalizeCode(code)), token, authTokenTTL)
	_, err = pipe.Exec(ctx)
	return err
}

// GetAuthToken retrieves and deletes the auth token data (GETDEL).
func (ra *RedisAuth) GetAuthToken(ctx context.Context, token string) (*AuthTokenData, error) {
	val, err := ra.rdb.GetDel(ctx, authTokenKey(token)).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var data AuthTokenData
	if err := json.Unmarshal([]byte(val), &data); err != nil {
		return nil, err
	}
	// Clean up the code index
	ra.rdb.Del(ctx, authCodeKey(data.Email, NormalizeCode(data.Code)))
	return &data, nil
}

// GetAuthTokenByCode looks up the token via the code index, verifies attempts, and returns data.
func (ra *RedisAuth) GetAuthTokenByCode(ctx context.Context, email, code string) (string, *AuthTokenData, error) {
	normalizedCode := NormalizeCode(code)
	tokenKey := authCodeKey(email, normalizedCode)

	token, err := ra.rdb.Get(ctx, tokenKey).Result()
	if err == redis.Nil {
		return "", nil, nil
	}
	if err != nil {
		return "", nil, err
	}

	// Get the token data (without deleting)
	val, err := ra.rdb.Get(ctx, authTokenKey(token)).Result()
	if err == redis.Nil {
		return "", nil, nil
	}
	if err != nil {
		return "", nil, err
	}

	var data AuthTokenData
	if err := json.Unmarshal([]byte(val), &data); err != nil {
		return "", nil, err
	}

	if data.Attempts >= maxCodeAttempts {
		// Too many attempts — delete everything
		ra.rdb.Del(ctx, authTokenKey(token), tokenKey)
		return "", nil, fmt.Errorf("too many attempts")
	}

	return token, &data, nil
}

// IncrAttempts increments the attempt counter for a token.
func (ra *RedisAuth) IncrAttempts(ctx context.Context, token string) error {
	key := authTokenKey(token)
	val, err := ra.rdb.Get(ctx, key).Result()
	if err != nil {
		return err
	}
	var data AuthTokenData
	if err := json.Unmarshal([]byte(val), &data); err != nil {
		return err
	}
	data.Attempts++
	b, _ := json.Marshal(data)
	return ra.rdb.Set(ctx, key, b, redis.KeepTTL).Err()
}

// DeleteAuthToken removes both the token and its code index.
func (ra *RedisAuth) DeleteAuthToken(ctx context.Context, token string) error {
	val, err := ra.rdb.Get(ctx, authTokenKey(token)).Result()
	if err == redis.Nil {
		return nil
	}
	if err != nil {
		return err
	}
	var data AuthTokenData
	if err := json.Unmarshal([]byte(val), &data); err != nil {
		return err
	}
	pipe := ra.rdb.Pipeline()
	pipe.Del(ctx, authTokenKey(token))
	pipe.Del(ctx, authCodeKey(data.Email, NormalizeCode(data.Code)))
	_, err = pipe.Exec(ctx)
	return err
}

// --- Rate limiting ---

// CheckRateLimit returns an error if the email has exceeded rate limits.
func (ra *RedisAuth) CheckRateLimit(ctx context.Context, email string) error {
	minKey := rateLimitMinKey(email)
	hrKey := rateLimitHrKey(email)

	minCount, err := ra.rdb.Get(ctx, minKey).Int()
	if err != nil && err != redis.Nil {
		return err
	}
	if minCount >= rateLimitMinMax {
		return fmt.Errorf("rate limit: too many requests per minute")
	}

	hrCount, err := ra.rdb.Get(ctx, hrKey).Int()
	if err != nil && err != redis.Nil {
		return err
	}
	if hrCount >= rateLimitHrMax {
		return fmt.Errorf("rate limit: too many requests per hour")
	}

	pipe := ra.rdb.Pipeline()
	pipe.Incr(ctx, minKey)
	pipe.Expire(ctx, minKey, rateLimitMinTTL)
	pipe.Incr(ctx, hrKey)
	pipe.Expire(ctx, hrKey, rateLimitHrTTL)
	_, err = pipe.Exec(ctx)
	return err
}

// --- Session operations ---

func sessionKey(sessionID string) string       { return "session:" + sessionID }
func userSessionsKey(userID string) string     { return "sessions:user:" + userID }

// CreateSession creates a new session in Redis.
func (ra *RedisAuth) CreateSession(ctx context.Context, sessionID string, data SessionData) error {
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	pipe := ra.rdb.Pipeline()
	pipe.Set(ctx, sessionKey(sessionID), b, ra.sessionExpiry)
	pipe.SAdd(ctx, userSessionsKey(data.UserID), sessionID)
	pipe.Expire(ctx, userSessionsKey(data.UserID), ra.sessionExpiry)
	_, err = pipe.Exec(ctx)
	return err
}

// GetSession retrieves session data from Redis.
func (ra *RedisAuth) GetSession(ctx context.Context, sessionID string) (*SessionData, error) {
	val, err := ra.rdb.Get(ctx, sessionKey(sessionID)).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var data SessionData
	if err := json.Unmarshal([]byte(val), &data); err != nil {
		return nil, err
	}
	return &data, nil
}

// ListUserSessions returns all active session IDs for a user.
func (ra *RedisAuth) ListUserSessions(ctx context.Context, userID string) ([]string, error) {
	return ra.rdb.SMembers(ctx, userSessionsKey(userID)).Result()
}

// DeleteSession removes a session from Redis.
func (ra *RedisAuth) DeleteSession(ctx context.Context, sessionID, userID string) error {
	pipe := ra.rdb.Pipeline()
	pipe.Del(ctx, sessionKey(sessionID))
	pipe.SRem(ctx, userSessionsKey(userID), sessionID)
	_, err := pipe.Exec(ctx)
	return err
}

// DeleteOtherSessions removes all sessions except the current one.
func (ra *RedisAuth) DeleteOtherSessions(ctx context.Context, currentSessionID, userID string) (int, error) {
	sessions, err := ra.ListUserSessions(ctx, userID)
	if err != nil {
		return 0, err
	}
	count := 0
	for _, sid := range sessions {
		if sid == currentSessionID {
			continue
		}
		if err := ra.DeleteSession(ctx, sid, userID); err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}

// RotateRefreshToken generates a new refresh token and updates the session.
func (ra *RedisAuth) RotateRefreshToken(ctx context.Context, sessionID string) (string, error) {
	sess, err := ra.GetSession(ctx, sessionID)
	if err != nil || sess == nil {
		return "", fmt.Errorf("session not found")
	}
	newToken, err := GenerateToken()
	if err != nil {
		return "", err
	}
	sess.RefreshToken = newToken
	sess.LastActiveAt = time.Now().UTC().Format(time.RFC3339)
	b, _ := json.Marshal(sess)
	if err := ra.rdb.Set(ctx, sessionKey(sessionID), b, ra.sessionExpiry).Err(); err != nil {
		return "", err
	}
	return newToken, nil
}

// TouchSession updates the last_active_at timestamp.
func (ra *RedisAuth) TouchSession(ctx context.Context, sessionID string) error {
	sess, err := ra.GetSession(ctx, sessionID)
	if err != nil || sess == nil {
		return nil
	}
	sess.LastActiveAt = time.Now().UTC().Format(time.RFC3339)
	b, _ := json.Marshal(sess)
	return ra.rdb.Set(ctx, sessionKey(sessionID), b, ra.sessionExpiry).Err()
}
