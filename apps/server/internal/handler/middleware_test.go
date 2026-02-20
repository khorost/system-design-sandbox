package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/system-design-sandbox/server/internal/auth"
)

const testJWTSecret = "test-jwt-secret-at-least-32-chars"

func TestRequireAuth(t *testing.T) {
	userID := "user-abc"
	sessionID := "session-xyz"

	protected := RequireAuth(testJWTSecret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := GetAuthUser(r.Context())
		if !ok {
			t.Fatal("expected auth user in context")
		}
		writeJSON(w, http.StatusOK, map[string]string{"uid": u.UserID, "sid": u.SessionID})
	}))

	t.Run("valid token passes", func(t *testing.T) {
		token, _ := auth.CreateAccessToken(testJWTSecret, userID, sessionID, 5*time.Minute)

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()

		protected.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var body map[string]string
		json.NewDecoder(w.Body).Decode(&body)
		if body["uid"] != userID {
			t.Errorf("uid = %q, want %q", body["uid"], userID)
		}
		if body["sid"] != sessionID {
			t.Errorf("sid = %q, want %q", body["sid"], sessionID)
		}
	})

	t.Run("missing Authorization header returns 401", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test", nil)
		w := httptest.NewRecorder()

		protected.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
		var body errorResponse
		json.NewDecoder(w.Body).Decode(&body)
		if body.Code != "unauthorized" {
			t.Errorf("code = %q, want %q", body.Code, "unauthorized")
		}
	})

	t.Run("non-Bearer prefix returns 401", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Basic abc")
		w := httptest.NewRecorder()

		protected.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
	})

	t.Run("expired token returns 401", func(t *testing.T) {
		token, _ := auth.CreateAccessToken(testJWTSecret, userID, sessionID, -1*time.Minute)

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()

		protected.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
		var body errorResponse
		json.NewDecoder(w.Body).Decode(&body)
		if body.Code != "token_expired" {
			t.Errorf("code = %q, want %q", body.Code, "token_expired")
		}
	})

	t.Run("wrong secret returns 401", func(t *testing.T) {
		token, _ := auth.CreateAccessToken("other-secret-key-32-chars!!!!!", userID, sessionID, 5*time.Minute)

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()

		protected.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
	})

	t.Run("malformed token returns 401", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer not-a-jwt-token")
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
