package handler

import (
	"testing"
)

func TestMaskEmail(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"user@example.com", "us**@ex*********"},
		{"ab@cd.io", "a**@cd***"},
		{"a@b.co", "a**@b.**"},
		{"test@gmail.com", "te**@gm*******"},
		{"noemail", "***"},
		{"x@y", "x**@y**"},
	}
	for _, tc := range tests {
		got := MaskEmail(tc.input)
		if got != tc.want {
			t.Errorf("MaskEmail(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestGravatarURL(t *testing.T) {
	t.Run("returns empty when not allowed", func(t *testing.T) {
		got := GravatarURL("user@example.com", false)
		if got != "" {
			t.Errorf("expected empty, got %q", got)
		}
	})

	t.Run("returns valid URL when allowed", func(t *testing.T) {
		got := GravatarURL("user@example.com", true)
		if got == "" {
			t.Fatal("expected non-empty URL")
		}
		// Known SHA-256 for "user@example.com"
		expected := "https://www.gravatar.com/avatar/b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514?d=identicon&s=80"
		if got != expected {
			t.Errorf("got %q, want %q", got, expected)
		}
	})

	t.Run("case insensitive and trimmed", func(t *testing.T) {
		a := GravatarURL("User@Example.COM", true)
		b := GravatarURL("  user@example.com  ", true)
		if a != b {
			t.Errorf("expected same URL for case variants: %q vs %q", a, b)
		}
	})
}
