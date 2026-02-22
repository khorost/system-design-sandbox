package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/system-design-sandbox/server/internal/storage"
)

type SimulationHandler struct {
	Store *storage.Storage
}

type createSimulationRequest struct {
	ArchitectureID string          `json:"architecture_id"`
	UserID         string          `json:"user_id"`
	ScenarioID     *string         `json:"scenario_id,omitempty"`
	Score          *int            `json:"score,omitempty"`
	Report         json.RawMessage `json:"report"`
	Metrics        json.RawMessage `json:"metrics"`
	DurationSec    *int            `json:"duration_sec,omitempty"`
}

func (h *SimulationHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createSimulationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	archID, err := parseUUID(req.ArchitectureID)
	if err != nil {
		http.Error(w, "invalid architecture_id", http.StatusBadRequest)
		return
	}

	userID, err := parseUUID(req.UserID)
	if err != nil {
		http.Error(w, "invalid user_id", http.StatusBadRequest)
		return
	}

	result, err := h.Store.CreateSimulationResult(r.Context(), archID, userID, req.ScenarioID, req.Score, req.Report, req.Metrics, req.DurationSec)
	if err != nil {
		http.Error(w, "failed to create simulation result", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(result)
}

func (h *SimulationHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	result, err := h.Store.GetSimulationResult(r.Context(), id)
	if err != nil {
		http.Error(w, "simulation result not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

func (h *SimulationHandler) ListByArchitecture(w http.ResponseWriter, r *http.Request) {
	archID, err := parseUUID(chi.URLParam(r, "architectureID"))
	if err != nil {
		http.Error(w, "invalid architecture_id", http.StatusBadRequest)
		return
	}

	results, err := h.Store.ListSimulationResultsByArchitecture(r.Context(), archID)
	if err != nil {
		http.Error(w, "failed to list simulation results", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(results)
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
