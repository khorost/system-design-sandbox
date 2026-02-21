package handler

import (
	"context"
	"net/http"
	"strings"

	"github.com/system-design-sandbox/server/internal/auth"
)

type contextKey string

const authUserKey contextKey = "authUser"

// AuthUser holds the authenticated user info extracted from JWT.
type AuthUser struct {
	UserID    string
	SessionID string
}

// RequireAuth returns a chi middleware that validates Bearer JWT tokens.
func RequireAuth(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				writeError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid authorization header")
				return
			}
			tokenStr := strings.TrimPrefix(header, "Bearer ")

			claims, err := auth.ParseAccessToken(jwtSecret, tokenStr)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "token_expired", "invalid or expired token")
				return
			}

			ctx := context.WithValue(r.Context(), authUserKey, AuthUser{
				UserID:    claims.UserID,
				SessionID: claims.SessionID,
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
