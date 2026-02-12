package storage

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/system-design-sandbox/server/internal/model"
)

func (s *Storage) CreateUser(ctx context.Context, email, name string) (model.User, error) {
	var u model.User
	err := s.Pool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, $2)
		 RETURNING id, email, name, created_at`,
		email, name,
	).Scan(&u.ID, &u.Email, &u.Name, &u.CreatedAt)
	return u, err
}

func (s *Storage) GetUser(ctx context.Context, id pgtype.UUID) (model.User, error) {
	var u model.User
	err := s.Pool.QueryRow(ctx,
		`SELECT id, email, name, created_at FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.Email, &u.Name, &u.CreatedAt)
	return u, err
}

func (s *Storage) ListUsers(ctx context.Context) ([]model.User, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, email, name, created_at FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []model.User
	for rows.Next() {
		var u model.User
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}
