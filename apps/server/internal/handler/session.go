package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/system-design-sandbox/server/internal/auth"
	"github.com/system-design-sandbox/server/internal/model"
	"github.com/system-design-sandbox/server/internal/storage"
)

type SessionHandler struct {
	Store     *storage.Storage
	RedisAuth *auth.RedisAuth
}

type sessionInfo struct {
	SessionID    string `json:"session_id"`
	IP           string `json:"ip"`
	UserAgent    string `json:"user_agent"`
	Geo          string `json:"geo"`
	CreatedAt    string `json:"created_at"`
	LastActiveAt string `json:"last_active_at"`
	Current      bool   `json:"current"`
}

// ListSessions handles GET /api/v1/auth/sessions
func (h *SessionHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	authUser, ok := GetAuthUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	sessionIDs, err := h.RedisAuth.ListUserSessions(r.Context(), authUser.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to list sessions")
		return
	}

	var sessions []sessionInfo
	for _, sid := range sessionIDs {
		sess, err := h.RedisAuth.GetSession(r.Context(), sid)
		if err != nil || sess == nil {
			continue
		}
		sessions = append(sessions, sessionInfo{
			SessionID:    sid,
			IP:           sess.IP,
			UserAgent:    sess.UserAgent,
			Geo:          sess.Geo,
			CreatedAt:    sess.CreatedAt,
			LastActiveAt: sess.LastActiveAt,
			Current:      sid == authUser.SessionID,
		})
	}

	if sessions == nil {
		sessions = []sessionInfo{}
	}

	writeJSON(w, http.StatusOK, sessions)
}

// RevokeSession handles DELETE /api/v1/auth/sessions/{sessionID}
func (h *SessionHandler) RevokeSession(w http.ResponseWriter, r *http.Request) {
	authUser, ok := GetAuthUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	targetSessionID := chi.URLParam(r, "sessionID")
	if targetSessionID == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "session ID is required")
		return
	}

	// Verify the session belongs to this user
	sess, err := h.RedisAuth.GetSession(r.Context(), targetSessionID)
	if err != nil || sess == nil || sess.UserID != authUser.UserID {
		writeError(w, http.StatusNotFound, "not_found", "session not found")
		return
	}

	h.RedisAuth.DeleteSession(r.Context(), targetSessionID, authUser.UserID)

	var uid pgtype.UUID
	uid.Scan(authUser.UserID)
	h.Store.CreateSessionLog(r.Context(), model.SessionLogEntry{
		UserID:    uid,
		SessionID: targetSessionID,
		Action:    "revoke",
		IP:        clientIP(r),
		UserAgent: r.UserAgent(),
	})

	w.WriteHeader(http.StatusNoContent)
}

// RevokeOtherSessions handles POST /api/v1/auth/sessions/revoke-others
func (h *SessionHandler) RevokeOtherSessions(w http.ResponseWriter, r *http.Request) {
	authUser, ok := GetAuthUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	count, err := h.RedisAuth.DeleteOtherSessions(r.Context(), authUser.SessionID, authUser.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to revoke sessions")
		return
	}

	writeJSON(w, http.StatusOK, map[string]int{"revoked": count})
}
