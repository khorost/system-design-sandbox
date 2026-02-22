package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/system-design-sandbox/server/internal/storage"
)

type ScenarioHandler struct {
	Store *storage.Storage
}

func (h *ScenarioHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	scenario, err := h.Store.GetScenario(r.Context(), id)
	if err != nil {
		http.Error(w, "scenario not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(scenario)
}

func (h *ScenarioHandler) List(w http.ResponseWriter, r *http.Request) {
	scenarios, err := h.Store.ListScenarios(r.Context())
	if err != nil {
		http.Error(w, "failed to list scenarios", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(scenarios)
}
