package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/system-design-sandbox/server/internal/storage"
)

type SimulationHandler struct {
	Store *storage.Storage
}

type createSimulationRequest struct {
	ArchitectureID string          `json:"architecture_id"`
	ScenarioID     *string         `json:"scenario_id,omitempty"`
	Score          *int            `json:"score,omitempty"`
	Report         json.RawMessage `json:"report"`
	Metrics        json.RawMessage `json:"metrics"`
	DurationSec    *int            `json:"duration_sec,omitempty"`
}

func (h *SimulationHandler) Create(w http.ResponseWriter, r *http.Request) {
	authUser, ok := GetAuthUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	var req createSimulationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid request body")
		return
	}

	archID, err := parseUUID(req.ArchitectureID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid architecture_id")
		return
	}

	userID, err := parseUUID(authUser.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid session user")
		return
	}

	result, err := h.Store.CreateSimulationResultForUser(r.Context(), archID, userID, req.ScenarioID, req.Score, req.Report, req.Metrics, req.DurationSec)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "not_found", "architecture not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "failed to create simulation result")
		return
	}

	writeJSON(w, http.StatusCreated, result)
}

func (h *SimulationHandler) Get(w http.ResponseWriter, r *http.Request) {
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

	result, err := h.Store.GetSimulationResultForUser(r.Context(), id, userID)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "not_found", "simulation result not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "failed to get simulation result")
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (h *SimulationHandler) ListByArchitecture(w http.ResponseWriter, r *http.Request) {
	authUser, ok := GetAuthUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "not authenticated")
		return
	}

	archID, err := parseUUID(chi.URLParam(r, "architectureID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid architecture_id")
		return
	}

	userID, err := parseUUID(authUser.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid session user")
		return
	}

	results, err := h.Store.ListSimulationResultsByArchitectureForUser(r.Context(), archID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to list simulation results")
		return
	}

	writeJSON(w, http.StatusOK, results)
}

func (h *SimulationHandler) Leaderboard(w http.ResponseWriter, r *http.Request) {
	scenarioID := chi.URLParam(r, "scenarioID")

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	entries, err := h.Store.GetLeaderboard(r.Context(), scenarioID, limit)
	if err != nil {
		http.Error(w, "failed to get leaderboard", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(entries)
}
