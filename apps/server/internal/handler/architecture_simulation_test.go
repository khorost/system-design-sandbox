package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func withAuthUser(req *http.Request, userID string) *http.Request {
	ctx := context.WithValue(req.Context(), authUserKey, AuthUser{UserID: userID, SessionID: "test-session"})
	return req.WithContext(ctx)
}

func withURLParam(req *http.Request, key, value string) *http.Request {
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add(key, value)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx)
	return req.WithContext(ctx)
}

func decodeErrorResponse(t *testing.T, body *bytes.Buffer) errorResponse {
	t.Helper()
	var resp errorResponse
	if err := json.NewDecoder(body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode error response: %v", err)
	}
	return resp
}

func TestArchitectureHandlerRequiresAuth(t *testing.T) {
	h := &ArchitectureHandler{}

	tests := []struct {
		name    string
		request *http.Request
		run     func(http.ResponseWriter, *http.Request)
	}{
		{
			name:    "create",
			request: httptest.NewRequest(http.MethodPost, "/architectures", bytes.NewBufferString(`{"name":"n","data":{}}`)),
			run:     h.Create,
		},
		{
			name:    "get",
			request: withURLParam(httptest.NewRequest(http.MethodGet, "/architectures/id", nil), "id", "0195d5cc-c9de-7ac6-bf7a-b2a2376f5a1a"),
			run:     h.Get,
		},
		{
			name:    "list mine",
			request: httptest.NewRequest(http.MethodGet, "/architectures/mine", nil),
			run:     h.ListMine,
		},
		{
			name:    "update",
			request: withURLParam(httptest.NewRequest(http.MethodPut, "/architectures/id", bytes.NewBufferString(`{"name":"n","data":{}}`)), "id", "0195d5cc-c9de-7ac6-bf7a-b2a2376f5a1a"),
			run:     h.Update,
		},
		{
			name:    "delete",
			request: withURLParam(httptest.NewRequest(http.MethodDelete, "/architectures/id", nil), "id", "0195d5cc-c9de-7ac6-bf7a-b2a2376f5a1a"),
			run:     h.Delete,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			tc.run(w, tc.request)

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

func TestArchitectureHandlerCreateIgnoresClientUserID(t *testing.T) {
	h := &ArchitectureHandler{}
	req := httptest.NewRequest(http.MethodPost, "/architectures", bytes.NewBufferString(`{
		"name":"sandbox",
		"description":"local body should not control ownership",
		"user_id":"0195d5cc-c9de-7ac6-bf7a-b2a2376f5a1a",
		"data":{"nodes":[],"edges":[]}
	}`))
	req = withAuthUser(req, "definitely-not-a-uuid")

	w := httptest.NewRecorder()
	h.Create(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
	resp := decodeErrorResponse(t, w.Body)
	if resp.Code != "unauthorized" || resp.Error != "invalid session user" {
		t.Fatalf("unexpected error response: %+v", resp)
	}
}

func TestSimulationHandlerRequiresAuth(t *testing.T) {
	h := &SimulationHandler{}

	tests := []struct {
		name    string
		request *http.Request
		run     func(http.ResponseWriter, *http.Request)
	}{
		{
			name:    "create",
			request: httptest.NewRequest(http.MethodPost, "/simulations", bytes.NewBufferString(`{"architecture_id":"0195d5cc-c9de-7ac6-bf7a-b2a2376f5a1a","report":{},"metrics":{}}`)),
			run:     h.Create,
		},
		{
			name:    "get",
			request: withURLParam(httptest.NewRequest(http.MethodGet, "/simulations/id", nil), "id", "0195d5cc-c9de-7ac6-bf7a-b2a2376f5a1a"),
			run:     h.Get,
		},
		{
			name:    "list by architecture",
			request: withURLParam(httptest.NewRequest(http.MethodGet, "/simulations/architecture/id", nil), "architectureID", "0195d5cc-c9de-7ac6-bf7a-b2a2376f5a1a"),
			run:     h.ListByArchitecture,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			tc.run(w, tc.request)

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

func TestSimulationHandlerCreateIgnoresClientUserID(t *testing.T) {
	h := &SimulationHandler{}
	req := httptest.NewRequest(http.MethodPost, "/simulations", bytes.NewBufferString(`{
		"architecture_id":"0195d5cc-c9de-7ac6-bf7a-b2a2376f5a1a",
		"user_id":"0195d5cc-c9de-7ac6-bf7a-b2a2376f5a1a",
		"report":{"status":"ok"},
		"metrics":{"p99":120}
	}`))
	req = withAuthUser(req, "not-a-valid-session-uuid")

	w := httptest.NewRecorder()
	h.Create(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
	resp := decodeErrorResponse(t, w.Body)
	if resp.Code != "unauthorized" || resp.Error != "invalid session user" {
		t.Fatalf("unexpected error response: %+v", resp)
	}
}
