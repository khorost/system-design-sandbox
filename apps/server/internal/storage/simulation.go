package storage

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/system-design-sandbox/server/internal/model"
)

func (s *Storage) CreateSimulationResult(ctx context.Context, archID, userID pgtype.UUID, scenarioID *string, score *int, report, metrics json.RawMessage, durationSec *int) (model.SimulationResult, error) {
	var r model.SimulationResult
	err := s.Pool.QueryRow(ctx,
		`INSERT INTO simulation_results (architecture_id, user_id, scenario_id, score, report, metrics, duration_sec)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, architecture_id, user_id, scenario_id, score, report, metrics, duration_sec, created_at`,
		archID, userID, scenarioID, score, report, metrics, durationSec,
	).Scan(&r.ID, &r.ArchitectureID, &r.UserID, &r.ScenarioID, &r.Score, &r.Report, &r.Metrics, &r.DurationSec, &r.CreatedAt)
	return r, err
}

func (s *Storage) GetSimulationResult(ctx context.Context, id pgtype.UUID) (model.SimulationResult, error) {
	var r model.SimulationResult
	err := s.Pool.QueryRow(ctx,
		`SELECT id, architecture_id, user_id, scenario_id, score, report, metrics, duration_sec, created_at
		 FROM simulation_results WHERE id = $1`,
		id,
	).Scan(&r.ID, &r.ArchitectureID, &r.UserID, &r.ScenarioID, &r.Score, &r.Report, &r.Metrics, &r.DurationSec, &r.CreatedAt)
	return r, err
}

func (s *Storage) ListSimulationResultsByArchitecture(ctx context.Context, archID pgtype.UUID) ([]model.SimulationResult, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, architecture_id, user_id, scenario_id, score, report, metrics, duration_sec, created_at
		 FROM simulation_results WHERE architecture_id = $1 ORDER BY created_at DESC`,
		archID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []model.SimulationResult
	for rows.Next() {
		var r model.SimulationResult
		if err := rows.Scan(&r.ID, &r.ArchitectureID, &r.UserID, &r.ScenarioID, &r.Score, &r.Report, &r.Metrics, &r.DurationSec, &r.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

func (s *Storage) GetLeaderboard(ctx context.Context, scenarioID string, limit int) ([]model.LeaderboardEntry, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT name, scenario_id, score, created_at, rank
		 FROM leaderboard WHERE scenario_id = $1 AND rank <= $2
		 ORDER BY rank`,
		scenarioID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []model.LeaderboardEntry
	for rows.Next() {
		var e model.LeaderboardEntry
		if err := rows.Scan(&e.Name, &e.ScenarioID, &e.Score, &e.CreatedAt, &e.Rank); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
