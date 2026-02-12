package storage

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/system-design-sandbox/server/internal/model"
)

func (s *Storage) CreateArchitecture(ctx context.Context, userID pgtype.UUID, name string, scenarioID *string, data json.RawMessage, isPublic bool) (model.Architecture, error) {
	var a model.Architecture
	err := s.Pool.QueryRow(ctx,
		`INSERT INTO architectures (user_id, name, scenario_id, data, is_public)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, user_id, name, scenario_id, data, thumbnail_url, is_public, created_at, updated_at`,
		userID, name, scenarioID, data, isPublic,
	).Scan(&a.ID, &a.UserID, &a.Name, &a.ScenarioID, &a.Data, &a.ThumbnailURL, &a.IsPublic, &a.CreatedAt, &a.UpdatedAt)
	return a, err
}

func (s *Storage) GetArchitecture(ctx context.Context, id pgtype.UUID) (model.Architecture, error) {
	var a model.Architecture
	err := s.Pool.QueryRow(ctx,
		`SELECT id, user_id, name, scenario_id, data, thumbnail_url, is_public, created_at, updated_at
		 FROM architectures WHERE id = $1`,
		id,
	).Scan(&a.ID, &a.UserID, &a.Name, &a.ScenarioID, &a.Data, &a.ThumbnailURL, &a.IsPublic, &a.CreatedAt, &a.UpdatedAt)
	return a, err
}

func (s *Storage) ListArchitecturesByUser(ctx context.Context, userID pgtype.UUID) ([]model.Architecture, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, user_id, name, scenario_id, data, thumbnail_url, is_public, created_at, updated_at
		 FROM architectures WHERE user_id = $1 ORDER BY updated_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var archs []model.Architecture
	for rows.Next() {
		var a model.Architecture
		if err := rows.Scan(&a.ID, &a.UserID, &a.Name, &a.ScenarioID, &a.Data, &a.ThumbnailURL, &a.IsPublic, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		archs = append(archs, a)
	}
	return archs, rows.Err()
}

func (s *Storage) UpdateArchitecture(ctx context.Context, id pgtype.UUID, name string, data json.RawMessage, isPublic bool) (model.Architecture, error) {
	var a model.Architecture
	err := s.Pool.QueryRow(ctx,
		`UPDATE architectures SET name = $2, data = $3, is_public = $4, updated_at = now()
		 WHERE id = $1
		 RETURNING id, user_id, name, scenario_id, data, thumbnail_url, is_public, created_at, updated_at`,
		id, name, data, isPublic,
	).Scan(&a.ID, &a.UserID, &a.Name, &a.ScenarioID, &a.Data, &a.ThumbnailURL, &a.IsPublic, &a.CreatedAt, &a.UpdatedAt)
	return a, err
}

func (s *Storage) DeleteArchitecture(ctx context.Context, id pgtype.UUID) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM architectures WHERE id = $1`, id)
	return err
}
