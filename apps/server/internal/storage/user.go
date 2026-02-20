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
		 RETURNING id, email, name, status, display_name, gravatar_allowed, created_at`,
		email, name,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Status, &u.DisplayName, &u.GravatarAllowed, &u.CreatedAt)
	return u, err
}

func (s *Storage) CreateUserWithStatus(ctx context.Context, email, name, status string) (model.User, error) {
	var u model.User
	err := s.Pool.QueryRow(ctx,
		`INSERT INTO users (email, name, status) VALUES ($1, $2, $3)
		 RETURNING id, email, name, status, display_name, gravatar_allowed, created_at`,
		email, name, status,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Status, &u.DisplayName, &u.GravatarAllowed, &u.CreatedAt)
	return u, err
}

func (s *Storage) GetUser(ctx context.Context, id pgtype.UUID) (model.User, error) {
	var u model.User
	err := s.Pool.QueryRow(ctx,
		`SELECT id, email, name, status, display_name, gravatar_allowed, created_at FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Status, &u.DisplayName, &u.GravatarAllowed, &u.CreatedAt)
	return u, err
}

func (s *Storage) GetUserByEmail(ctx context.Context, email string) (model.User, error) {
	var u model.User
	err := s.Pool.QueryRow(ctx,
		`SELECT id, email, name, status, display_name, gravatar_allowed, created_at FROM users WHERE email = $1`,
		email,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Status, &u.DisplayName, &u.GravatarAllowed, &u.CreatedAt)
	return u, err
}

func (s *Storage) ActivateUser(ctx context.Context, id pgtype.UUID) error {
	_, err := s.Pool.Exec(ctx,
		`UPDATE users SET status = 'active' WHERE id = $1`, id)
	return err
}

func (s *Storage) UpdateUserProfile(ctx context.Context, id pgtype.UUID, displayName *string, gravatarAllowed *bool) (model.User, error) {
	var u model.User
	err := s.Pool.QueryRow(ctx,
		`UPDATE users SET
			display_name = COALESCE($2, display_name),
			gravatar_allowed = COALESCE($3, gravatar_allowed)
		 WHERE id = $1
		 RETURNING id, email, name, status, display_name, gravatar_allowed, created_at`,
		id, displayName, gravatarAllowed,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Status, &u.DisplayName, &u.GravatarAllowed, &u.CreatedAt)
	return u, err
}

func (s *Storage) ListUsers(ctx context.Context) ([]model.User, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, email, name, status, display_name, gravatar_allowed, created_at FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []model.User
	for rows.Next() {
		var u model.User
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.Status, &u.DisplayName, &u.GravatarAllowed, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}
