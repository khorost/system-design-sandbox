package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/system-design-sandbox/server/internal/config"
	"github.com/system-design-sandbox/server/internal/metrics"
)

func TestPrivateArchitectureAndSimulationRoutesRequireAuth(t *testing.T) {
	ra := setupTestRedisAuth(t)
	r := NewRouter(
		&config.Config{PublicURL: "https://example.com"},
		nil,
		ra,
		nil,
		nil,
		&metrics.Collector{},
		metrics.NewHub(0),
	)

	tests := []struct {
		name   string
		method string
		target string
	}{
		{name: "list mine", method: http.MethodGet, target: "/api/v1/architectures/mine"},
		{name: "create architecture", method: http.MethodPost, target: "/api/v1/architectures/"},
		{name: "get architecture", method: http.MethodGet, target: "/api/v1/architectures/0195d5cc-c9de-7ac6-bf7a-b2a2376f5a1a"},
		{name: "create simulation", method: http.MethodPost, target: "/api/v1/simulations/"},
		{name: "list simulation results", method: http.MethodGet, target: "/api/v1/simulations/architecture/0195d5cc-c9de-7ac6-bf7a-b2a2376f5a1a"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.target, nil)
			w := httptest.NewRecorder()

			r.ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401, got %d", w.Code)
			}
			resp := decodeErrorResponse(t, w.Body)
			if resp.Code != "unauthorized" {
				t.Fatalf("expected unauthorized code, got %q", resp.Code)
			}
		})
	}
}

func TestLegacyUserScopedArchitectureRouteIsGone(t *testing.T) {
	r := NewRouter(
		&config.Config{PublicURL: "https://example.com"},
		nil,
		setupTestRedisAuth(t),
		nil,
		nil,
		&metrics.Collector{},
		metrics.NewHub(time.Second),
	)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/architectures/user/0195d5cc-c9de-7ac6-bf7a-b2a2376f5a1a", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}
