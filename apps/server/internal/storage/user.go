package storage

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/system-design-sandbox/server/internal/model"
)

const userColumns = `id, email, name, status, display_name, gravatar_allowed, referral_source, created_at`

func scanUser(row interface{ Scan(dest ...any) error }) (model.User, error) {
	var u model.User
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.Status, &u.DisplayName, &u.GravatarAllowed, &u.ReferralSource, &u.CreatedAt)
	return u, err
}

func (s *Storage) CreateUser(ctx context.Context, email, name string) (model.User, error) {
	return scanUser(s.Pool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, $2)
		 RETURNING `+userColumns,
		email, name,
	))
}

func (s *Storage) CreateUserWithStatus(ctx context.Context, email, name, status string) (model.User, error) {
	return scanUser(s.Pool.QueryRow(ctx,
		`INSERT INTO users (email, name, status) VALUES ($1, $2, $3)
		 RETURNING `+userColumns,
		email, name, status,
	))
}

func (s *Storage) GetUser(ctx context.Context, id pgtype.UUID) (model.User, error) {
	return scanUser(s.Pool.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE id = $1`,
		id,
	))
}

func (s *Storage) GetUserByEmail(ctx context.Context, email string) (model.User, error) {
	return scanUser(s.Pool.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE email = $1`,
		email,
	))
}

func (s *Storage) ActivateUser(ctx context.Context, id pgtype.UUID) error {
	_, err := s.Pool.Exec(ctx,
		`UPDATE users SET status = 'active' WHERE id = $1`, id)
	return err
}

func (s *Storage) UpdateUserProfile(ctx context.Context, id pgtype.UUID, displayName *string, gravatarAllowed *bool, referralSource *string) (model.User, error) {
	return scanUser(s.Pool.QueryRow(ctx,
		`UPDATE users SET
			display_name = COALESCE($2, display_name),
			gravatar_allowed = COALESCE($3, gravatar_allowed),
			referral_source = COALESCE($4, referral_source)
		 WHERE id = $1
		 RETURNING `+userColumns,
		id, displayName, gravatarAllowed, referralSource,
	))
}

func (s *Storage) ListUsers(ctx context.Context) ([]model.User, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT `+userColumns+` FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []model.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}
