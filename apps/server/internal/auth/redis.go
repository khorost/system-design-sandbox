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
	rateLimitHrTTL  = 3600 * time.Second
	maxCodeAttempts = 5
)

// AuthTokenData is the data stored in Redis for a pending auth token.
type AuthTokenData struct {
	Code     string `json:"code"`
	Email    string `json:"email"`
	Attempts int    `json:"attempts"`
}

// SessionData is the data stored as a Redis hash for an active session.
// Using HSET allows atomic updates of individual fields (e.g. last_active_at)
// without read-modify-write cycles.
// UA is not stored here — it goes only to the session_log table.
type SessionData struct {
	UserID       string
	RefreshToken string
	IP           string
	Geo          string
	CreatedAt    string
	LastActiveAt string
}

// RedisAuth provides auth-related Redis operations.
type RedisAuth struct {
	rdb             redis.UniversalClient
	sessionExpiry   time.Duration
	rateLimitPerMin int
	rateLimitPerHr  int
}

// NewRedisAuth creates a new RedisAuth instance.
func NewRedisAuth(rdb redis.UniversalClient, sessionExpiry time.Duration, rateLimitPerMin, rateLimitPerHr int) *RedisAuth {
	return &RedisAuth{
		rdb:             rdb,
		sessionExpiry:   sessionExpiry,
		rateLimitPerMin: rateLimitPerMin,
		rateLimitPerHr:  rateLimitPerHr,
	}
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

// RateLimitError is returned when the rate limit is exceeded.
type RateLimitError struct {
	RetryAfter int // seconds until the limit resets
}

func (e *RateLimitError) Error() string {
	return fmt.Sprintf("rate limit exceeded, retry after %d seconds", e.RetryAfter)
}

// CheckRateLimit returns a *RateLimitError if the email has exceeded rate limits.
func (ra *RedisAuth) CheckRateLimit(ctx context.Context, email string) error {
	minKey := rateLimitMinKey(email)
	hrKey := rateLimitHrKey(email)

	minCount, err := ra.rdb.Get(ctx, minKey).Int()
	if err != nil && err != redis.Nil {
		return err
	}
	if minCount >= ra.rateLimitPerMin {
		ttl, _ := ra.rdb.TTL(ctx, minKey).Result()
		retryAfter := int(ttl.Seconds())
		if retryAfter <= 0 {
			retryAfter = int(rateLimitMinTTL.Seconds())
		}
		return &RateLimitError{RetryAfter: retryAfter}
	}

	hrCount, err := ra.rdb.Get(ctx, hrKey).Int()
	if err != nil && err != redis.Nil {
		return err
	}
	if hrCount >= ra.rateLimitPerHr {
		ttl, _ := ra.rdb.TTL(ctx, hrKey).Result()
		retryAfter := int(ttl.Seconds())
		if retryAfter <= 0 {
			retryAfter = int(rateLimitHrTTL.Seconds())
		}
		return &RateLimitError{RetryAfter: retryAfter}
	}

	pipe := ra.rdb.Pipeline()
	pipe.Incr(ctx, minKey)
	pipe.Expire(ctx, minKey, rateLimitMinTTL)
	pipe.Incr(ctx, hrKey)
	pipe.Expire(ctx, hrKey, rateLimitHrTTL)
	_, err = pipe.Exec(ctx)
	return err
}

// --- Session operations (Redis hashes) ---

const (
	fUserID       = "uid"
	fRefreshToken = "rt"
	fIP           = "ip"
	fGeo          = "geo"
	fCreatedAt    = "cat"
	fLastActiveAt = "lat"
)

func sessionKey(sessionID string) string   { return "s:" + sessionID }
func userSessionsKey(userID string) string { return "su:" + userID }

// CreateSession creates a new session as a Redis hash.
func (ra *RedisAuth) CreateSession(ctx context.Context, sessionID string, data SessionData) error {
	key := sessionKey(sessionID)
	pipe := ra.rdb.Pipeline()
	pipe.HSet(ctx, key, map[string]interface{}{
		fUserID:       data.UserID,
		fRefreshToken: data.RefreshToken,
		fIP:           data.IP,
		fGeo:          data.Geo,
		fCreatedAt:    data.CreatedAt,
		fLastActiveAt: data.LastActiveAt,
	})
	pipe.Expire(ctx, key, ra.sessionExpiry)
	pipe.SAdd(ctx, userSessionsKey(data.UserID), sessionID)
	pipe.Expire(ctx, userSessionsKey(data.UserID), ra.sessionExpiry)
	_, err := pipe.Exec(ctx)
	return err
}

// GetSession retrieves session data from a Redis hash.
func (ra *RedisAuth) GetSession(ctx context.Context, sessionID string) (*SessionData, error) {
	m, err := ra.rdb.HGetAll(ctx, sessionKey(sessionID)).Result()
	if err != nil {
		return nil, err
	}
	if len(m) == 0 {
		return nil, nil
	}
	return &SessionData{
		UserID:       m[fUserID],
		RefreshToken: m[fRefreshToken],
		IP:           m[fIP],
		Geo:          m[fGeo],
		CreatedAt:    m[fCreatedAt],
		LastActiveAt: m[fLastActiveAt],
	}, nil
}

// ListUserSessions returns all active session IDs for a user.
func (ra *RedisAuth) ListUserSessions(ctx context.Context, userID string) ([]string, error) {
	return ra.rdb.SMembers(ctx, userSessionsKey(userID)).Result()
}

// SessionInfoItem is a resolved session with display data from Redis.
type SessionInfoItem struct {
	SessionID    string
	IP           string
	Geo          string
	CreatedAt    string
	LastActiveAt string
	Current      bool
}

// ListUserSessionsFull returns resolved sessions using a pipeline of HGETALL.
// Stale IDs (expired keys) are cleaned from the SET automatically.
func (ra *RedisAuth) ListUserSessionsFull(ctx context.Context, userID, currentSessionID string) ([]SessionInfoItem, error) {
	ids, err := ra.rdb.SMembers(ctx, userSessionsKey(userID)).Result()
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return []SessionInfoItem{}, nil
	}

	// Pipeline HGETALL for all session keys at once
	pipe := ra.rdb.Pipeline()
	cmds := make([]*redis.MapStringStringCmd, len(ids))
	for i, sid := range ids {
		cmds[i] = pipe.HGetAll(ctx, sessionKey(sid))
	}
	_, _ = pipe.Exec(ctx)

	var staleIDs []string
	sessions := make([]SessionInfoItem, 0, len(ids))
	for i, cmd := range cmds {
		m, err := cmd.Result()
		if err != nil || len(m) == 0 {
			staleIDs = append(staleIDs, ids[i])
			continue
		}
		sessions = append(sessions, SessionInfoItem{
			SessionID:    ids[i],
			IP:           m[fIP],
			Geo:          m[fGeo],
			CreatedAt:    m[fCreatedAt],
			LastActiveAt: m[fLastActiveAt],
			Current:      ids[i] == currentSessionID,
		})
	}

	// Clean stale IDs from the SET
	if len(staleIDs) > 0 {
		members := make([]interface{}, len(staleIDs))
		for i, id := range staleIDs {
			members[i] = id
		}
		ra.rdb.SRem(ctx, userSessionsKey(userID), members...)
	}

	return sessions, nil
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

// RotateRefreshToken generates a new refresh token and updates only the changed fields.
func (ra *RedisAuth) RotateRefreshToken(ctx context.Context, sessionID string) (string, error) {
	key := sessionKey(sessionID)
	exists, err := ra.rdb.Exists(ctx, key).Result()
	if err != nil {
		return "", err
	}
	if exists == 0 {
		return "", fmt.Errorf("session not found")
	}
	newToken, err := GenerateToken()
	if err != nil {
		return "", err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	pipe := ra.rdb.Pipeline()
	pipe.HSet(ctx, key, fRefreshToken, newToken, fLastActiveAt, now)
	pipe.Expire(ctx, key, ra.sessionExpiry)
	if _, err := pipe.Exec(ctx); err != nil {
		return "", err
	}
	return newToken, nil
}

// TouchSession updates only the last_active_at field.
func (ra *RedisAuth) TouchSession(ctx context.Context, sessionID string) error {
	key := sessionKey(sessionID)
	exists, err := ra.rdb.Exists(ctx, key).Result()
	if err != nil || exists == 0 {
		return nil
	}
	now := time.Now().UTC().Format(time.RFC3339)
	return ra.rdb.HSet(ctx, key, fLastActiveAt, now).Err()
}
