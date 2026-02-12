package storage

import (
	"context"

	"github.com/system-design-sandbox/server/internal/model"
)

func (s *Storage) GetScenario(ctx context.Context, id string) (model.Scenario, error) {
	var sc model.Scenario
	err := s.Pool.QueryRow(ctx,
		`SELECT id, lesson_number, title, description, config, difficulty, tags
		 FROM scenarios WHERE id = $1`,
		id,
	).Scan(&sc.ID, &sc.LessonNumber, &sc.Title, &sc.Description, &sc.Config, &sc.Difficulty, &sc.Tags)
	return sc, err
}

func (s *Storage) ListScenarios(ctx context.Context) ([]model.Scenario, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, lesson_number, title, description, config, difficulty, tags
		 FROM scenarios ORDER BY lesson_number`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var scenarios []model.Scenario
	for rows.Next() {
		var sc model.Scenario
		if err := rows.Scan(&sc.ID, &sc.LessonNumber, &sc.Title, &sc.Description, &sc.Config, &sc.Difficulty, &sc.Tags); err != nil {
			return nil, err
		}
		scenarios = append(scenarios, sc)
	}
	return scenarios, rows.Err()
}
