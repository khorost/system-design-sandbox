package storage

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/system-design-sandbox/server/internal/compress"
	"github.com/system-design-sandbox/server/internal/model"
)

func (s *Storage) CreateArchitecture(ctx context.Context, userID pgtype.UUID, name string, description string, scenarioID *string, data json.RawMessage, isPublic bool, tags []string) (model.Architecture, error) {
	gz, err := compress.Gzip(data)
	if err != nil {
		return model.Architecture{}, err
	}
	if tags == nil {
		tags = []string{}
	}

	var a model.Architecture
	err = s.Pool.QueryRow(ctx,
		`INSERT INTO architectures (user_id, name, description, scenario_id, data, is_public, tags)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, user_id, name, description, scenario_id, thumbnail_url, is_public, tags, created_at, updated_at`,
		userID, name, description, scenarioID, gz, isPublic, tags,
	).Scan(&a.ID, &a.UserID, &a.Name, &a.Description, &a.ScenarioID, &a.ThumbnailURL, &a.IsPublic, &a.Tags, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return model.Architecture{}, err
	}
	a.RawData = json.RawMessage(data)
	return a, nil
}

func (s *Storage) GetArchitecture(ctx context.Context, id pgtype.UUID) (model.Architecture, error) {
	var a model.Architecture
	err := s.Pool.QueryRow(ctx,
		`SELECT id, user_id, name, description, scenario_id, data, thumbnail_url, is_public, tags, created_at, updated_at
		 FROM architectures WHERE id = $1`,
		id,
	).Scan(&a.ID, &a.UserID, &a.Name, &a.Description, &a.ScenarioID, &a.Data, &a.ThumbnailURL, &a.IsPublic, &a.Tags, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return model.Architecture{}, err
	}

	raw, err := compress.Gunzip(a.Data)
	if err != nil {
		return model.Architecture{}, err
	}
	a.RawData = json.RawMessage(raw)
	return a, nil
}

func (s *Storage) ListArchitecturesByUser(ctx context.Context, userID pgtype.UUID) ([]model.ArchitectureListItem, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, user_id, name, description, scenario_id, thumbnail_url, is_public, tags, created_at, updated_at
		 FROM architectures WHERE user_id = $1 ORDER BY updated_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.ArchitectureListItem
	for rows.Next() {
		var a model.ArchitectureListItem
		if err := rows.Scan(&a.ID, &a.UserID, &a.Name, &a.Description, &a.ScenarioID, &a.ThumbnailURL, &a.IsPublic, &a.Tags, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, a)
	}
	return items, rows.Err()
}

func (s *Storage) UpdateArchitecture(ctx context.Context, id pgtype.UUID, name string, description string, data json.RawMessage, isPublic bool, tags []string) (model.Architecture, error) {
	gz, err := compress.Gzip(data)
	if err != nil {
		return model.Architecture{}, err
	}
	if tags == nil {
		tags = []string{}
	}

	var a model.Architecture
	err = s.Pool.QueryRow(ctx,
		`UPDATE architectures SET name = $2, description = $3, data = $4, is_public = $5, tags = $6, updated_at = now()
		 WHERE id = $1
		 RETURNING id, user_id, name, description, scenario_id, thumbnail_url, is_public, tags, created_at, updated_at`,
		id, name, description, gz, isPublic, tags,
	).Scan(&a.ID, &a.UserID, &a.Name, &a.Description, &a.ScenarioID, &a.ThumbnailURL, &a.IsPublic, &a.Tags, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return model.Architecture{}, err
	}
	a.RawData = json.RawMessage(data)
	return a, nil
}

func (s *Storage) DeleteArchitecture(ctx context.Context, id pgtype.UUID) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM architectures WHERE id = $1`, id)
	return err
}
