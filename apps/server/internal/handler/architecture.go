package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/system-design-sandbox/server/internal/storage"
)

type ArchitectureHandler struct {
	Store *storage.Storage
}

type createArchitectureRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	ScenarioID  *string         `json:"scenario_id,omitempty"`
	Data        json.RawMessage `json:"data"`
	IsPublic    bool            `json:"is_public"`
	Tags        []string        `json:"tags"`
}

type updateArchitectureRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Data        json.RawMessage `json:"data"`
	IsPublic    bool            `json:"is_public"`
	Tags        []string        `json:"tags"`
}

func (h *ArchitectureHandler) Create(w http.ResponseWriter, r *http.Request) {
	authUser, ok := GetAuthUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	var req createArchitectureRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid request body")
		return
	}

	userID, err := parseUUID(authUser.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid session user")
		return
	}

	arch, err := h.Store.CreateArchitecture(r.Context(), userID, req.Name, req.Description, req.ScenarioID, req.Data, req.IsPublic, req.Tags)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to create architecture")
		return
	}

	writeJSON(w, http.StatusCreated, arch)
}

func (h *ArchitectureHandler) Get(w http.ResponseWriter, r *http.Request) {
	authUser, ok := GetAuthUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}

	userID, err := parseUUID(authUser.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid session user")
		return
	}

	arch, err := h.Store.GetArchitectureForUser(r.Context(), id, userID)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "not_found", "architecture not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "failed to get architecture")
		return
	}

	writeJSON(w, http.StatusOK, arch)
}

func (h *ArchitectureHandler) ListMine(w http.ResponseWriter, r *http.Request) {
	authUser, ok := GetAuthUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	userID, err := parseUUID(authUser.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid session user")
		return
	}

	archs, err := h.Store.ListArchitecturesByUser(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to list architectures")
		return
	}

	writeJSON(w, http.StatusOK, archs)
}

func (h *ArchitectureHandler) Update(w http.ResponseWriter, r *http.Request) {
	authUser, ok := GetAuthUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}

	userID, err := parseUUID(authUser.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid session user")
		return
	}

	var req updateArchitectureRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid request body")
		return
	}

	arch, err := h.Store.UpdateArchitectureForUser(r.Context(), id, userID, req.Name, req.Description, req.Data, req.IsPublic, req.Tags)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "not_found", "architecture not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "failed to update architecture")
		return
	}

	writeJSON(w, http.StatusOK, arch)
}

func (h *ArchitectureHandler) Delete(w http.ResponseWriter, r *http.Request) {
	authUser, ok := GetAuthUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid id")
		return
	}

	userID, err := parseUUID(authUser.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid session user")
		return
	}

	if err := h.Store.DeleteArchitectureForUser(r.Context(), id, userID); err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "not_found", "architecture not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "failed to delete architecture")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
