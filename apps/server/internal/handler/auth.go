package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/system-design-sandbox/server/internal/auth"
	"github.com/system-design-sandbox/server/internal/config"
	"github.com/system-design-sandbox/server/internal/model"
	"github.com/system-design-sandbox/server/internal/storage"
)

type AuthHandler struct {
	Store     *storage.Storage
	RedisAuth *auth.RedisAuth
	Email     auth.EmailSender
	Config    *config.Config
}

// --- Request/Response types ---

type registerRequest struct {
	Email     string `json:"email"`
	PromoCode string `json:"promo_code"`
}

type loginRequest struct {
	Email string `json:"email"`
}

type verifyRequest struct {
	Token string `json:"token"`
}

type verifyCodeRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type authResponse struct {
	AccessToken string     `json:"access_token"`
	User        model.User `json:"user"`
}

// --- Handlers ---

// Register handles POST /api/v1/auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid request body")
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		// Always return ok to prevent email enumeration
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	// Validate promo code
	if req.PromoCode == "" {
		writeError(w, http.StatusBadRequest, "promo_required", "promo code is required")
		return
	}
	if err := h.Store.ValidateAndUsePromo(r.Context(), req.PromoCode); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_promo", "invalid or expired promo code")
		return
	}

	// Check rate limit
	if err := h.RedisAuth.CheckRateLimit(r.Context(), req.Email); err != nil {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	// Check if user already exists
	_, err := h.Store.GetUserByEmail(r.Context(), req.Email)
	if err == nil {
		// User exists — send login email instead of registering
		h.sendAuthEmail(r, req.Email)
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	// Create user with pending status
	_, err = h.Store.CreateUserWithStatus(r.Context(), req.Email, req.Email, "pending_verification")
	if err != nil {
		slog.Error("register: create user failed", "error", err)
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	h.sendAuthEmail(r, req.Email)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Login handles POST /api/v1/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid request body")
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	// Check rate limit
	if err := h.RedisAuth.CheckRateLimit(r.Context(), req.Email); err != nil {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	// Check if user exists
	_, err := h.Store.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		// User doesn't exist — still return ok (anti-enumeration)
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	h.sendAuthEmail(r, req.Email)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Verify handles POST /api/v1/auth/verify (magic link)
func (h *AuthHandler) Verify(w http.ResponseWriter, r *http.Request) {
	var req verifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid request body")
		return
	}

	if req.Token == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "token is required")
		return
	}

	data, err := h.RedisAuth.GetAuthToken(r.Context(), req.Token)
	if err != nil || data == nil {
		writeError(w, http.StatusBadRequest, "invalid_token", "invalid or expired token")
		return
	}

	h.completeVerification(w, r, data.Email)
}

// VerifyCode handles POST /api/v1/auth/verify-code
func (h *AuthHandler) VerifyCode(w http.ResponseWriter, r *http.Request) {
	var req verifyCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid request body")
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" || req.Code == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "email and code are required")
		return
	}

	token, data, err := h.RedisAuth.GetAuthTokenByCode(r.Context(), req.Email, req.Code)
	if err != nil {
		writeError(w, http.StatusBadRequest, "too_many_attempts", "too many attempts, request a new code")
		return
	}
	if data == nil {
		writeError(w, http.StatusBadRequest, "invalid_code", "invalid or expired code")
		return
	}

	// Timing-safe compare the normalized codes
	if !auth.TimingSafeEqual(auth.NormalizeCode(data.Code), auth.NormalizeCode(req.Code)) {
		h.RedisAuth.IncrAttempts(r.Context(), token)
		writeError(w, http.StatusBadRequest, "invalid_code", "invalid code")
		return
	}

	// Delete the token now that it's verified
	h.RedisAuth.DeleteAuthToken(r.Context(), token)

	h.completeVerification(w, r, data.Email)
}

// Refresh handles POST /api/v1/auth/refresh
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	// Read refresh token from cookie
	cookie, err := r.Cookie("refresh_token")
	if err != nil {
		writeError(w, http.StatusUnauthorized, "no_refresh_token", "refresh token not found")
		return
	}

	// Try to extract session ID from the cookie value format: sessionID:refreshToken
	parts := strings.SplitN(cookie.Value, ":", 2)
	if len(parts) != 2 {
		writeError(w, http.StatusUnauthorized, "invalid_refresh_token", "invalid refresh token format")
		return
	}
	sessionID, refreshToken := parts[0], parts[1]

	sess, err := h.RedisAuth.GetSession(r.Context(), sessionID)
	if err != nil || sess == nil {
		h.clearRefreshCookie(w)
		writeError(w, http.StatusUnauthorized, "session_expired", "session expired")
		return
	}

	if !auth.TimingSafeEqual(sess.RefreshToken, refreshToken) {
		h.clearRefreshCookie(w)
		writeError(w, http.StatusUnauthorized, "invalid_refresh_token", "invalid refresh token")
		return
	}

	// Rotate refresh token
	newRefreshToken, err := h.RedisAuth.RotateRefreshToken(r.Context(), sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to rotate refresh token")
		return
	}

	// Create new access token
	accessToken, err := auth.CreateAccessToken(
		h.Config.JWT.Secret, sess.UserID, sessionID, h.Config.JWT.AccessExpiry,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to create access token")
		return
	}

	// Get user
	var uid pgtype.UUID
	uid.Scan(sess.UserID)
	user, err := h.Store.GetUser(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to get user")
		return
	}

	// Log refresh
	h.Store.CreateSessionLog(r.Context(), model.SessionLogEntry{
		UserID:    uid,
		SessionID: sessionID,
		Action:    "refresh",
		IP:        clientIP(r),
		UserAgent: r.UserAgent(),
	})

	h.setRefreshCookie(w, sessionID, newRefreshToken)
	writeJSON(w, http.StatusOK, authResponse{AccessToken: accessToken, User: user})
}

// Logout handles POST /api/v1/auth/logout
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	authUser, ok := GetAuthUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	h.RedisAuth.DeleteSession(r.Context(), authUser.SessionID, authUser.UserID)

	var uid pgtype.UUID
	uid.Scan(authUser.UserID)
	h.Store.CreateSessionLog(r.Context(), model.SessionLogEntry{
		UserID:    uid,
		SessionID: authUser.SessionID,
		Action:    "logout",
		IP:        clientIP(r),
		UserAgent: r.UserAgent(),
	})

	h.clearRefreshCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

// --- Helpers ---

func (h *AuthHandler) sendAuthEmail(r *http.Request, email string) {
	token, err := auth.GenerateToken()
	if err != nil {
		slog.Error("auth: generate token failed", "error", err)
		return
	}
	code, err := auth.GenerateCode()
	if err != nil {
		slog.Error("auth: generate code failed", "error", err)
		return
	}

	if err := h.RedisAuth.SaveAuthToken(r.Context(), token, code, email); err != nil {
		slog.Error("auth: save token failed", "error", err)
		return
	}

	if err := h.Email.SendLoginEmail(email, token, code, h.Config.PublicURL); err != nil {
		slog.Error("auth: send email failed", "error", err)
	}
}

func (h *AuthHandler) completeVerification(w http.ResponseWriter, r *http.Request, email string) {
	user, err := h.Store.GetUserByEmail(r.Context(), email)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusBadRequest, "user_not_found", "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "failed to get user")
		return
	}

	// Activate user if pending
	if user.Status == "pending_verification" {
		if err := h.Store.ActivateUser(r.Context(), user.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "failed to activate user")
			return
		}
		user.Status = "active"
	}

	if user.Status == "disabled" {
		writeError(w, http.StatusForbidden, "account_disabled", "account is disabled")
		return
	}

	// Create session
	sessionID, err := auth.GenerateSessionID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to generate session")
		return
	}
	refreshToken, err := auth.GenerateToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to generate refresh token")
		return
	}

	userIDStr := fmt.Sprintf("%x-%x-%x-%x-%x",
		user.ID.Bytes[0:4], user.ID.Bytes[4:6], user.ID.Bytes[6:8],
		user.ID.Bytes[8:10], user.ID.Bytes[10:16])

	now := time.Now().UTC().Format(time.RFC3339)
	sessData := auth.SessionData{
		UserID:       userIDStr,
		RefreshToken: refreshToken,
		IP:           clientIP(r),
		UserAgent:    r.UserAgent(),
		CreatedAt:    now,
		LastActiveAt: now,
	}

	if err := h.RedisAuth.CreateSession(r.Context(), sessionID, sessData); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to create session")
		return
	}

	// Create access token
	accessToken, err := auth.CreateAccessToken(
		h.Config.JWT.Secret, userIDStr, sessionID, h.Config.JWT.AccessExpiry,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to create access token")
		return
	}

	// Log login
	h.Store.CreateSessionLog(r.Context(), model.SessionLogEntry{
		UserID:    user.ID,
		SessionID: sessionID,
		Action:    "login",
		IP:        clientIP(r),
		UserAgent: r.UserAgent(),
	})

	h.setRefreshCookie(w, sessionID, refreshToken)

	// If this is from htmx (verify page), send HX-Redirect
	if r.Header.Get("HX-Request") == "true" {
		w.Header().Set("HX-Redirect", h.Config.PublicURL)
		writeJSON(w, http.StatusOK, authResponse{AccessToken: accessToken, User: user})
		return
	}

	writeJSON(w, http.StatusOK, authResponse{AccessToken: accessToken, User: user})
}

func (h *AuthHandler) setRefreshCookie(w http.ResponseWriter, sessionID, refreshToken string) {
	maxAge := int(h.Config.JWT.RefreshExpiry.Seconds())
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    sessionID + ":" + refreshToken,
		Path:     "/api/v1/auth",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   strings.HasPrefix(h.Config.PublicURL, "https"),
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *AuthHandler) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    "",
		Path:     "/api/v1/auth",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   strings.HasPrefix(h.Config.PublicURL, "https"),
		SameSite: http.SameSiteLaxMode,
	})
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	// Strip port from RemoteAddr
	addr := r.RemoteAddr
	if idx := strings.LastIndex(addr, ":"); idx != -1 {
		return addr[:idx]
	}
	return addr
}
