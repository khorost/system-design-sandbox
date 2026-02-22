package model

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

type User struct {
	ID              pgtype.UUID        `json:"id"`
	Email           string             `json:"email"`
	Name            string             `json:"name"`
	Status          string             `json:"status"`
	DisplayName     *string            `json:"display_name,omitempty"`
	GravatarAllowed bool               `json:"gravatar_allowed"`
	ReferralSource  *string            `json:"referral_source,omitempty"`
	CreatedAt       pgtype.Timestamptz `json:"created_at"`
}

// MarshalJSON adds computed gravatar_url field to User JSON output.
func (u User) MarshalJSON() ([]byte, error) {
	type Alias User
	aux := struct {
		Alias
		GravatarURL string `json:"gravatar_url,omitempty"`
	}{
		Alias: Alias(u),
	}
	if u.GravatarAllowed && u.Email != "" {
		hash := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(u.Email))))
		aux.GravatarURL = fmt.Sprintf("https://www.gravatar.com/avatar/%x?d=identicon&s=80", hash)
	}
	return json.Marshal(&aux)
}

type SessionLogEntry struct {
	ID        pgtype.UUID        `json:"id"`
	UserID    pgtype.UUID        `json:"user_id"`
	SessionID string             `json:"session_id"`
	Action    string             `json:"action"`
	IP        string             `json:"ip,omitempty"`
	UserAgent string             `json:"user_agent,omitempty"`
	Geo       string             `json:"geo,omitempty"`
	CreatedAt pgtype.Timestamptz `json:"created_at"`
}

type Architecture struct {
	ID           pgtype.UUID        `json:"id"`
	UserID       pgtype.UUID        `json:"user_id"`
	Name         string             `json:"name"`
	Description  string             `json:"description"`
	ScenarioID   *string            `json:"scenario_id,omitempty"`
	Data         []byte             `json:"-"`
	RawData      json.RawMessage    `json:"data,omitempty"`
	ThumbnailURL *string            `json:"thumbnail_url,omitempty"`
	IsPublic     bool               `json:"is_public"`
	Tags         []string           `json:"tags"`
	CreatedAt    pgtype.Timestamptz `json:"created_at"`
	UpdatedAt    pgtype.Timestamptz `json:"updated_at"`
}

type ArchitectureListItem struct {
	ID           pgtype.UUID        `json:"id"`
	UserID       pgtype.UUID        `json:"user_id"`
	Name         string             `json:"name"`
	Description  string             `json:"description"`
	ScenarioID   *string            `json:"scenario_id,omitempty"`
	ThumbnailURL *string            `json:"thumbnail_url,omitempty"`
	IsPublic     bool               `json:"is_public"`
	Tags         []string           `json:"tags"`
	CreatedAt    pgtype.Timestamptz `json:"created_at"`
	UpdatedAt    pgtype.Timestamptz `json:"updated_at"`
}

type Scenario struct {
	ID           string          `json:"id"`
	LessonNumber int             `json:"lesson_number"`
	Title        string          `json:"title"`
	Description  string          `json:"description"`
	Config       json.RawMessage `json:"config"`
	Difficulty   *string         `json:"difficulty,omitempty"`
	Tags         []string        `json:"tags,omitempty"`
}

type SimulationResult struct {
	ID             pgtype.UUID        `json:"id"`
	ArchitectureID pgtype.UUID        `json:"architecture_id"`
	UserID         pgtype.UUID        `json:"user_id"`
	ScenarioID     *string            `json:"scenario_id,omitempty"`
	Score          *int               `json:"score,omitempty"`
	Report         json.RawMessage    `json:"report"`
	Metrics        json.RawMessage    `json:"metrics"`
	DurationSec    *int               `json:"duration_sec,omitempty"`
	CreatedAt      pgtype.Timestamptz `json:"created_at"`
}

type LeaderboardEntry struct {
	Name       string    `json:"name"`
	ScenarioID string    `json:"scenario_id"`
	Score      int       `json:"score"`
	CreatedAt  time.Time `json:"created_at"`
	Rank       int       `json:"rank"`
}
