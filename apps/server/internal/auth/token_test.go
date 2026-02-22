package auth

import (
	"regexp"
	"strings"
	"testing"
)

func TestGenerateToken(t *testing.T) {
	t.Run("returns 64-char hex string", func(t *testing.T) {
		token, err := GenerateToken()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(token) != 64 {
			t.Errorf("expected length 64, got %d", len(token))
		}
		if match, _ := regexp.MatchString(`^[0-9a-f]{64}$`, token); !match {
			t.Errorf("token is not valid hex: %s", token)
		}
	})

	t.Run("generates unique tokens", func(t *testing.T) {
		seen := make(map[string]bool)
		for i := 0; i < 100; i++ {
			token, err := GenerateToken()
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if seen[token] {
				t.Fatalf("duplicate token generated: %s", token)
			}
			seen[token] = true
		}
	})
}

func TestGenerateCode(t *testing.T) {
	t.Run("returns XXX-XXX format", func(t *testing.T) {
		code, err := GenerateCode()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if match, _ := regexp.MatchString(`^[A-Z2-9]{3}-[A-Z2-9]{3}$`, code); !match {
			t.Errorf("code does not match XXX-XXX format: %s", code)
		}
	})

	t.Run("excludes ambiguous characters", func(t *testing.T) {
		for i := 0; i < 200; i++ {
			code, err := GenerateCode()
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			raw := strings.ReplaceAll(code, "-", "")
			if strings.ContainsAny(raw, "01OI") {
				t.Errorf("code contains ambiguous character: %s", code)
			}
		}
	})

	t.Run("generates unique codes", func(t *testing.T) {
		seen := make(map[string]bool)
		for i := 0; i < 100; i++ {
			code, err := GenerateCode()
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if seen[code] {
				t.Fatalf("duplicate code generated: %s", code)
			}
			seen[code] = true
		}
	})
}

func TestGenerateSessionID(t *testing.T) {
	sid, err := GenerateSessionID()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(sid) != 32 {
		t.Errorf("expected length 32, got %d", len(sid))
	}
	if match, _ := regexp.MatchString(`^[0-9a-f]{32}$`, sid); !match {
		t.Errorf("session ID is not valid hex: %s", sid)
	}
}

func TestTimingSafeEqual(t *testing.T) {
	tests := []struct {
		a, b string
		want bool
	}{
		{"abc", "abc", true},
		{"abc", "def", false},
		{"", "", true},
		{"abc", "abcd", false},
		{"ABC123", "ABC123", true},
	}
	for _, tc := range tests {
		got := TimingSafeEqual(tc.a, tc.b)
		if got != tc.want {
			t.Errorf("TimingSafeEqual(%q, %q) = %v, want %v", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestNormalizeCode(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"ABC-DEF", "ABCDEF"},
		{"abc-def", "ABCDEF"},
		{"AbC-dEf", "ABCDEF"},
		{"ABCDEF", "ABCDEF"},
		{"abc", "ABC"},
		{"a-b-c", "ABC"},
	}
	for _, tc := range tests {
		got := NormalizeCode(tc.input)
		if got != tc.want {
			t.Errorf("NormalizeCode(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

