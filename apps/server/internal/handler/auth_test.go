package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientIP(t *testing.T) {
	tests := []struct {
		name       string
		xff        string
		xri        string
		remoteAddr string
		want       string
	}{
		{
			name:       "X-Forwarded-For single IP",
			xff:        "1.2.3.4",
			remoteAddr: "127.0.0.1:1234",
			want:       "1.2.3.4",
		},
		{
			name:       "X-Forwarded-For multiple IPs takes first",
			xff:        "1.2.3.4, 5.6.7.8, 9.10.11.12",
			remoteAddr: "127.0.0.1:1234",
			want:       "1.2.3.4",
		},
		{
			name:       "X-Real-IP when no XFF",
			xri:        "10.0.0.1",
			remoteAddr: "127.0.0.1:1234",
			want:       "10.0.0.1",
		},
		{
			name:       "XFF takes precedence over X-Real-IP",
			xff:        "1.2.3.4",
			xri:        "10.0.0.1",
			remoteAddr: "127.0.0.1:1234",
			want:       "1.2.3.4",
		},
		{
			name:       "RemoteAddr strips port",
			remoteAddr: "192.168.1.1:4567",
			want:       "192.168.1.1",
		},
		{
			name:       "RemoteAddr without port",
			remoteAddr: "192.168.1.1",
			want:       "192.168.1.1",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = tc.remoteAddr
			if tc.xff != "" {
				req.Header.Set("X-Forwarded-For", tc.xff)
			}
			if tc.xri != "" {
				req.Header.Set("X-Real-IP", tc.xri)
			}

			got := clientIP(req)
			if got != tc.want {
				t.Errorf("clientIP() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestVerifyPageRequiresToken(t *testing.T) {
	// Minimal test: verify page returns 400 when no token is provided
	req := httptest.NewRequest("GET", "/auth/verify", nil)
	w := httptest.NewRecorder()

	// Create a minimal AuthHandler (VerifyPage doesn't need store/redis/email)
	h := &AuthHandler{}
	h.VerifyPage(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestVerifyPageRendersHTML(t *testing.T) {
	req := httptest.NewRequest("GET", "/auth/verify?token=abc123", nil)
	w := httptest.NewRecorder()

	h := &AuthHandler{}
	h.VerifyPage(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); ct != "text/html; charset=utf-8" {
		t.Errorf("Content-Type = %q, want text/html; charset=utf-8", ct)
	}
	if rp := w.Header().Get("Referrer-Policy"); rp != "no-referrer" {
		t.Errorf("Referrer-Policy = %q, want no-referrer", rp)
	}
	body := w.Body.String()
	if !contains(body, "abc123") {
		t.Error("response body does not contain token")
	}
	if !contains(body, "htmx") {
		t.Error("response body does not reference htmx")
	}
	if !contains(body, "hx-post") {
		t.Error("response body does not contain hx-post attribute")
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsStr(s, substr))
}

func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
