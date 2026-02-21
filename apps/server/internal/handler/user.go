package handler

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/system-design-sandbox/server/internal/storage"
)

type UserHandler struct {
	Store *storage.Storage
}

type createUserRequest struct {
	Email string `json:"email"`
	Name  string `json:"name"`
}

func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.Name == "" {
		http.Error(w, "email and name are required", http.StatusBadRequest)
		return
	}

	user, err := h.Store.CreateUser(r.Context(), req.Email, req.Name)
	if err != nil {
		http.Error(w, "failed to create user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(user)
}

func (h *UserHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	user, err := h.Store.GetUser(r.Context(), id)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	users, err := h.Store.ListUsers(r.Context())
	if err != nil {
		http.Error(w, "failed to list users", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

// Me handles GET /api/v1/users/me — returns the authenticated user's profile.
func (h *UserHandler) Me(w http.ResponseWriter, r *http.Request) {
	authUser, ok := GetAuthUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	var uid pgtype.UUID
	uid.Scan(authUser.UserID)

	user, err := h.Store.GetUser(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "user not found")
		return
	}

	writeJSON(w, http.StatusOK, user)
}

type updateProfileRequest struct {
	DisplayName     *string `json:"display_name"`
	GravatarAllowed *bool   `json:"gravatar_allowed"`
	ReferralSource  *string `json:"referral_source"`
}

// UpdateMe handles PATCH /api/v1/users/me — updates the authenticated user's profile.
func (h *UserHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	authUser, ok := GetAuthUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	var req updateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid request body")
		return
	}

	var uid pgtype.UUID
	uid.Scan(authUser.UserID)

	user, err := h.Store.UpdateUserProfile(r.Context(), uid, req.DisplayName, req.GravatarAllowed, req.ReferralSource)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to update profile")
		return
	}

	writeJSON(w, http.StatusOK, user)
}

type publicProfile struct {
	ID              pgtype.UUID        `json:"id"`
	DisplayName     *string            `json:"display_name,omitempty"`
	MaskedEmail     string             `json:"masked_email"`
	GravatarURL     string             `json:"gravatar_url,omitempty"`
}

// GetPublic handles GET /api/v1/users/{id}/public — returns a public-safe user profile.
func (h *UserHandler) GetPublic(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}

	user, err := h.Store.GetUser(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "user not found")
		return
	}

	profile := publicProfile{
		ID:          user.ID,
		DisplayName: user.DisplayName,
		MaskedEmail: MaskEmail(user.Email),
		GravatarURL: GravatarURL(user.Email, user.GravatarAllowed),
	}

	writeJSON(w, http.StatusOK, profile)
}

func parseUUID(s string) (pgtype.UUID, error) {
	var id pgtype.UUID
	err := id.Scan(s)
	return id, err
}

// MaskEmail masks an email address for display: "user@example.com" → "us**@ex***le.com"
func MaskEmail(email string) string {
	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 {
		return "***"
	}
	local := parts[0]
	domain := parts[1]

	maskedLocal := maskString(local)
	maskedDomain := maskString(domain)

	return maskedLocal + "@" + maskedDomain
}

func maskString(s string) string {
	if len(s) <= 2 {
		return s[:1] + "**"
	}
	return s[:2] + strings.Repeat("*", len(s)-2)
}

// GravatarURL returns the Gravatar URL if allowed, empty string otherwise.
func GravatarURL(email string, allowed bool) string {
	if !allowed {
		return ""
	}
	hash := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(email))))
	return fmt.Sprintf("https://www.gravatar.com/avatar/%x?d=identicon&s=80", hash)
}
