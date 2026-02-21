package handler

import (
	"net/http"
	"sort"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/system-design-sandbox/server/internal/auth"
	"github.com/system-design-sandbox/server/internal/config"
	"github.com/system-design-sandbox/server/internal/model"
	"github.com/system-design-sandbox/server/internal/storage"
)

type SessionHandler struct {
	Store     *storage.Storage
	RedisAuth *auth.RedisAuth
	Config    *config.Config
}

type sessionInfo struct {
	SessionID    string `json:"session_id"`
	IP           string `json:"ip"`
	Geo          string `json:"geo"`
	CreatedAt    string `json:"created_at"`
	LastActiveAt string `json:"last_active_at"`
	Current      bool   `json:"current"`
}

type sessionsResponse struct {
	Sessions []sessionInfo `json:"sessions"`
	Total    int           `json:"total"`
}

// ListSessions handles GET /api/v1/auth/sessions
// Query params: ?limit=N (0 = all, default 6 = current + 5 recent)
// All data comes from Redis (no PostgreSQL).
func (h *SessionHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	authUser, ok := GetAuthUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	all, err := h.RedisAuth.ListUserSessionsFull(r.Context(), authUser.UserID, authUser.SessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to list sessions")
		return
	}

	// Sort: current first, then by last_active_at descending
	sort.Slice(all, func(i, j int) bool {
		if all[i].Current != all[j].Current {
			return all[i].Current
		}
		return all[i].LastActiveAt > all[j].LastActiveAt
	})

	total := len(all)

	// Apply limit (default 6: current + 5 recent)
	limit := 6
	if q := r.URL.Query().Get("limit"); q != "" {
		if v, err := strconv.Atoi(q); err == nil && v >= 0 {
			limit = v
		}
	}
	if limit > 0 && limit < total {
		all = all[:limit]
	}

	out := make([]sessionInfo, 0, len(all))
	for _, s := range all {
		out = append(out, sessionInfo{
			SessionID:    s.SessionID,
			IP:           s.IP,
			Geo:          s.Geo,
			CreatedAt:    s.CreatedAt,
			LastActiveAt: s.LastActiveAt,
			Current:      s.Current,
		})
	}

	writeJSON(w, http.StatusOK, sessionsResponse{Sessions: out, Total: total})
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

	if h.Config.SessionLogEnabled {
		var uid pgtype.UUID
		uid.Scan(authUser.UserID)
		h.Store.CreateSessionLog(r.Context(), model.SessionLogEntry{
			UserID:    uid,
			SessionID: targetSessionID,
			Action:    "revoke",
			IP:        clientIP(r),
			UserAgent: r.UserAgent(),
		})
	}

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
