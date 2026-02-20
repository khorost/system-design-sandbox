package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// AccessClaims are the JWT claims for access tokens.
type AccessClaims struct {
	UserID    string `json:"uid"`
	SessionID string `json:"sid"`
	jwt.RegisteredClaims
}

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

// CreateAccessToken creates a signed JWT access token.
func CreateAccessToken(secret string, userID, sessionID string, expiry time.Duration) (string, error) {
	now := time.Now()
	claims := AccessClaims{
		UserID:    userID,
		SessionID: sessionID,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(expiry)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// ParseAccessToken validates and parses a JWT access token.
func ParseAccessToken(secret, tokenStr string) (*AccessClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &AccessClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*AccessClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}
	return claims, nil
}
