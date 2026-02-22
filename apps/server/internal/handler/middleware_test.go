package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/system-design-sandbox/server/internal/auth"
)

// setupTestRedis returns a RedisAuth backed by a real miniredis-like instance
// or an integration Redis. For unit tests we use an in-process Redis client
// pointed at a test server if available, otherwise skip.
func setupTestRedisAuth(t *testing.T) *auth.RedisAuth {
	t.Helper()
	// Use a Redis instance running at localhost:6379 for integration tests.
	// Skip if not available.
	rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379", DB: 15})
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Skip("Redis not available, skipping middleware integration test")
	}
	t.Cleanup(func() {
		rdb.FlushDB(context.Background())
		_ = rdb.Close()
	})
	return auth.NewRedisAuth(rdb, 7*24*time.Hour, 20*time.Second, 100, 100)
}

func TestRequireAuth(t *testing.T) {
	ra := setupTestRedisAuth(t)

	userID := "user-abc"
	sessionID := "test-session-id-123"

	// Create a valid session in Redis
	err := ra.CreateSession(context.Background(), sessionID, auth.SessionData{
		UserID:       userID,
		IP:           "127.0.0.1",
		CreatedAt:    time.Now().UTC().Format(time.RFC3339),
		LastActiveAt: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		t.Fatalf("failed to create test session: %v", err)
	}

	protected := RequireAuth(ra)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := GetAuthUser(r.Context())
		if !ok {
			t.Fatal("expected auth user in context")
		}
		writeJSON(w, http.StatusOK, map[string]string{"uid": u.UserID, "sid": u.SessionID})
	}))

	t.Run("valid session cookie passes", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test", nil)
		req.AddCookie(&http.Cookie{Name: "session_id", Value: sessionID})
		w := httptest.NewRecorder()

		protected.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var body map[string]string
		_ = json.NewDecoder(w.Body).Decode(&body)
		if body["uid"] != userID {
			t.Errorf("uid = %q, want %q", body["uid"], userID)
		}
		if body["sid"] != sessionID {
			t.Errorf("sid = %q, want %q", body["sid"], sessionID)
		}
	})

	t.Run("missing cookie returns 401", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test", nil)
		w := httptest.NewRecorder()

		protected.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
		var body errorResponse
		_ = json.NewDecoder(w.Body).Decode(&body)
		if body.Code != "unauthorized" {
			t.Errorf("code = %q, want %q", body.Code, "unauthorized")
		}
	})

	t.Run("invalid session ID returns 401", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test", nil)
		req.AddCookie(&http.Cookie{Name: "session_id", Value: "nonexistent-session"})
		w := httptest.NewRecorder()

		protected.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
		var body errorResponse
		_ = json.NewDecoder(w.Body).Decode(&body)
		if body.Code != "session_expired" {
			t.Errorf("code = %q, want %q", body.Code, "session_expired")
		}
	})

	t.Run("empty cookie value returns 401", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test", nil)
		req.AddCookie(&http.Cookie{Name: "session_id", Value: ""})
		w := httptest.NewRecorder()

		protected.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
	})
}

func TestGetAuthUser_NoContext(t *testing.T) {
	req := httptest.NewRequest("GET", "/test", nil)
	_, ok := GetAuthUser(req.Context())
	if ok {
		t.Fatal("expected ok=false when no auth user in context")
	}
}
