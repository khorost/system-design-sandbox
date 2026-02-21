package auth

import (
	"testing"

	"github.com/system-design-sandbox/server/internal/config"
)

func TestNewEmailSender_ConsoleFallback(t *testing.T) {
	sender := NewEmailSender(config.SMTPConfig{Host: ""})
	if sender == nil {
		t.Fatal("expected non-nil sender")
	}
	// Should be console sender — calling it should not panic
	err := sender.SendLoginEmail("test@example.com", "token123", "ABC-DEF", "https://example.com")
	if err != nil {
		t.Fatalf("console sender should not error: %v", err)
	}
}

func TestNewEmailSender_SMTPWhenHostSet(t *testing.T) {
	sender := NewEmailSender(config.SMTPConfig{
		Host: "smtp.example.com",
		Port: 587,
		From: "test@example.com",
		TLS:  "starttls",
	})
	if sender == nil {
		t.Fatal("expected non-nil sender")
	}
	// Should be smtpSender, not consoleSender
	if _, ok := sender.(*smtpSender); !ok {
		t.Errorf("expected *smtpSender, got %T", sender)
	}
}

func TestConsoleSender_NoError(t *testing.T) {
	s := &consoleSender{}
	err := s.SendLoginEmail("user@example.com", "abc123", "XYZ-789", "https://test.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestBuildEmailHTML(t *testing.T) {
	html := buildEmailHTML("ABC-DEF", "https://example.com/auth/verify?token=xyz")

	if !strContains(html, "ABC-DEF") {
		t.Error("HTML does not contain code")
	}
	if !strContains(html, "https://example.com/auth/verify?token=xyz") {
		t.Error("HTML does not contain link")
	}
	if !strContains(html, "5 minutes") {
		t.Error("HTML does not mention expiry time")
	}
	if !strContains(html, "System Design Sandbox") {
		t.Error("HTML does not contain app name")
	}
}

func strContains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
