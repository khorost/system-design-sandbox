package handler

import (
	"context"
	"net/http"

	"github.com/system-design-sandbox/server/internal/auth"
)

type contextKey string

const authUserKey contextKey = "authUser"

// AuthUser holds the authenticated user info extracted from session cookie.
type AuthUser struct {
	UserID    string
	SessionID string
}

// RequireAuth returns a chi middleware that validates session cookies via Redis.
func RequireAuth(redisAuth *auth.RedisAuth) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("session_id")
			if err != nil || cookie.Value == "" {
				writeError(w, http.StatusUnauthorized, "unauthorized", "missing session")
				return
			}

			sess, err := redisAuth.ValidateAndTouchSession(r.Context(), cookie.Value)
			if err != nil || sess == nil {
				writeError(w, http.StatusUnauthorized, "session_expired", "session expired")
				return
			}

			ctx := context.WithValue(r.Context(), authUserKey, AuthUser{
				UserID:    sess.UserID,
				SessionID: cookie.Value,
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetAuthUser extracts the authenticated user from the request context.
func GetAuthUser(ctx context.Context) (AuthUser, bool) {
	u, ok := ctx.Value(authUserKey).(AuthUser)
	return u, ok
}
