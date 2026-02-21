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
	"github.com/system-design-sandbox/server/internal/geoip"
	"github.com/system-design-sandbox/server/internal/model"
	"github.com/system-design-sandbox/server/internal/storage"
)

type AuthHandler struct {
	Store     *storage.Storage
	RedisAuth *auth.RedisAuth
	Email     auth.EmailSender
	Config    *config.Config
	GeoIP     *geoip.Lookup
}

// --- Request/Response types ---

type sendCodeRequest struct {
	Email string `json:"email"`
}

type authConfigResponse struct {
	ReferralFieldEnabled bool `json:"referral_field_enabled"`
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

// SendCode handles POST /api/v1/auth/send-code
// Unified entry point: creates user if not exists, sends auth code.
func (h *AuthHandler) SendCode(w http.ResponseWriter, r *http.Request) {
	var req sendCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid request body")
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		slog.Warn("send-code: invalid email", "email", req.Email)
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	// Check rate limit
	if err := h.RedisAuth.CheckRateLimit(r.Context(), req.Email); err != nil {
		if rlErr, ok := err.(*auth.RateLimitError); ok {
			slog.Warn("send-code: rate limited", "email", req.Email, "retry_after", rlErr.RetryAfter)
			writeJSON(w, http.StatusTooManyRequests, map[string]interface{}{
				"error":       "Too many requests. Please try again later.",
				"code":        "rate_limited",
				"retry_after": rlErr.RetryAfter,
			})
		} else {
			slog.Error("send-code: rate limit check failed", "email", req.Email, "error", err)
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		}
		return
	}

	// Check if user exists
	_, err := h.Store.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		// User doesn't exist — create with pending status
		_, err = h.Store.CreateUserWithStatus(r.Context(), req.Email, req.Email, "pending_verification")
		if err != nil {
			// Race condition: concurrent INSERT may fail on unique constraint — re-read
			_, retryErr := h.Store.GetUserByEmail(r.Context(), req.Email)
			if retryErr != nil {
				slog.Error("send-code: create user failed", "error", err)
				writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
				return
			}
			// User was created by concurrent request — proceed
		}
	}

	h.sendAuthEmail(r, req.Email)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// AuthConfig handles GET /api/v1/auth/config
// Returns public auth configuration.
func (h *AuthHandler) AuthConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, authConfigResponse{
		ReferralFieldEnabled: h.Config.ReferralFieldEnabled,
	})
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
		if r.Header.Get("HX-Request") == "true" {
			writeVerifyError(w, h.Config.PublicURL, "This link has expired or has already been used.")
			return
		}
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

	currentMatch := auth.TimingSafeEqual(sess.RefreshToken, refreshToken)
	prevMatch := sess.PrevRefreshToken != "" && auth.TimingSafeEqual(sess.PrevRefreshToken, refreshToken)

	if !currentMatch && !prevMatch {
		h.clearRefreshCookie(w)
		writeError(w, http.StatusUnauthorized, "invalid_refresh_token", "invalid refresh token")
		return
	}

	// If the previous token matched, another tab already rotated.
	// Return the current token without rotating again.
	activeRefreshToken := sess.RefreshToken
	if currentMatch {
		rotated, err := h.RedisAuth.RotateRefreshToken(r.Context(), sessionID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "failed to rotate refresh token")
			return
		}
		activeRefreshToken = rotated
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
	if h.Config.SessionLogEnabled {
		h.Store.CreateSessionLog(r.Context(), model.SessionLogEntry{
			UserID:    uid,
			SessionID: sessionID,
			Action:    "refresh",
			IP:        clientIP(r),
			UserAgent: r.UserAgent(),
		})
	}

	h.setRefreshCookie(w, sessionID, activeRefreshToken)
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

	if h.Config.SessionLogEnabled {
		var uid pgtype.UUID
		uid.Scan(authUser.UserID)
		h.Store.CreateSessionLog(r.Context(), model.SessionLogEntry{
			UserID:    uid,
			SessionID: authUser.SessionID,
			Action:    "logout",
			IP:        clientIP(r),
			UserAgent: r.UserAgent(),
		})
	}

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

	slog.Info("auth: sending login email", "email", email)
	if err := h.Email.SendLoginEmail(email, token, code, h.Config.PublicURL); err != nil {
		slog.Error("auth: send email failed", "email", email, "error", err)
	} else {
		slog.Info("auth: login email sent", "email", email)
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
		if r.Header.Get("HX-Request") == "true" {
			writeVerifyError(w, h.Config.PublicURL, "This account has been disabled.")
			return
		}
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

	ip := clientIP(r)
	now := time.Now().UTC().Format(time.RFC3339)
	sessData := auth.SessionData{
		UserID:       userIDStr,
		RefreshToken: refreshToken,
		IP:           ip,
		Geo:          h.GeoIP.City(ip),
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
	if h.Config.SessionLogEnabled {
		h.Store.CreateSessionLog(r.Context(), model.SessionLogEntry{
			UserID:    user.ID,
			SessionID: sessionID,
			Action:    "login",
			IP:        ip,
			UserAgent: r.UserAgent(),
			Geo:       h.GeoIP.City(ip),
		})
	}

	h.setRefreshCookie(w, sessionID, refreshToken)

	// If this is from htmx (verify page), return success HTML with auto-redirect
	if r.Header.Get("HX-Request") == "true" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<p style="color:#4ade80;font-size:16px;font-weight:600;margin-bottom:8px;">Verified successfully!</p>`+
			`<p style="color:#94a3b8;font-size:13px;">Redirecting in <span id="countdown">3</span> seconds...</p>`+
			`<script>(function(){var n=3,el=document.getElementById("countdown"),`+
			`t=setInterval(function(){n--;if(n<=0){clearInterval(t);window.location.href=%q}else{el.textContent=n}},1000)})()</script>`,
			h.Config.PublicURL)
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
