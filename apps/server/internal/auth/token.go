package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
)

// GenerateToken returns a cryptographically random 32-byte hex string (magic link token).
func GenerateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// GenerateCode returns a 6-character alphanumeric code formatted as XXX-XXX.
func GenerateCode() (string, error) {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no 0/O/1/I
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate code: %w", err)
	}
	for i := range b {
		b[i] = charset[b[i]%byte(len(charset))]
	}
	return string(b[:3]) + "-" + string(b[3:]), nil
}

// GenerateSessionID returns a 16-byte hex string for session identification.
func GenerateSessionID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate session id: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// TimingSafeEqual performs a constant-time string comparison.
func TimingSafeEqual(a, b string) bool {
	return hmac.Equal([]byte(a), []byte(b))
}

// NormalizeCode removes dashes and uppercases for comparison.
func NormalizeCode(code string) string {
	return strings.ToUpper(strings.ReplaceAll(code, "-", ""))
}
