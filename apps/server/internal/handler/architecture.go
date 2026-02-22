package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/system-design-sandbox/server/internal/storage"
)

type ArchitectureHandler struct {
	Store *storage.Storage
}

type createArchitectureRequest struct {
	UserID      string          `json:"user_id"`
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
	var req createArchitectureRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	userID, err := parseUUID(req.UserID)
	if err != nil {
		http.Error(w, "invalid user_id", http.StatusBadRequest)
		return
	}

	arch, err := h.Store.CreateArchitecture(r.Context(), userID, req.Name, req.Description, req.ScenarioID, req.Data, req.IsPublic, req.Tags)
	if err != nil {
		http.Error(w, "failed to create architecture", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(arch)
}

func (h *ArchitectureHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	arch, err := h.Store.GetArchitecture(r.Context(), id)
	if err != nil {
		http.Error(w, "architecture not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(arch)
}

func (h *ArchitectureHandler) ListByUser(w http.ResponseWriter, r *http.Request) {
	userID, err := parseUUID(chi.URLParam(r, "userID"))
	if err != nil {
		http.Error(w, "invalid user_id", http.StatusBadRequest)
		return
	}

	archs, err := h.Store.ListArchitecturesByUser(r.Context(), userID)
	if err != nil {
		http.Error(w, "failed to list architectures", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(archs)
}

func (h *ArchitectureHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	var req updateArchitectureRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	arch, err := h.Store.UpdateArchitecture(r.Context(), id, req.Name, req.Description, req.Data, req.IsPublic, req.Tags)
	if err != nil {
		http.Error(w, "failed to update architecture", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(arch)
}

func (h *ArchitectureHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	if err := h.Store.DeleteArchitecture(r.Context(), id); err != nil {
		http.Error(w, "failed to delete architecture", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
