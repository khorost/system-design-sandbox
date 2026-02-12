package model

import (
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

type User struct {
	ID        pgtype.UUID        `json:"id"`
	Email     string             `json:"email"`
	Name      string             `json:"name"`
	CreatedAt pgtype.Timestamptz `json:"created_at"`
}

type Architecture struct {
	ID           pgtype.UUID        `json:"id"`
	UserID       pgtype.UUID        `json:"user_id"`
	Name         string             `json:"name"`
	ScenarioID   *string            `json:"scenario_id,omitempty"`
	Data         json.RawMessage    `json:"data"`
	ThumbnailURL *string            `json:"thumbnail_url,omitempty"`
	IsPublic     bool               `json:"is_public"`
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
