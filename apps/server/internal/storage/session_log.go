package storage

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/system-design-sandbox/server/internal/model"
)

func (s *Storage) CreateSessionLog(ctx context.Context, entry model.SessionLogEntry) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO session_log (user_id, session_id, action, ip, user_agent, geo)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		entry.UserID, entry.SessionID, entry.Action, entry.IP, entry.UserAgent, entry.Geo,
	)
	return err
}

func (s *Storage) ListSessionLogs(ctx context.Context, userID pgtype.UUID, limit int) ([]model.SessionLogEntry, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.Pool.Query(ctx,
		`SELECT id, user_id, session_id, action, ip, user_agent, geo, created_at
		 FROM session_log WHERE user_id = $1
		 ORDER BY created_at DESC LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []model.SessionLogEntry
	for rows.Next() {
		var e model.SessionLogEntry
		if err := rows.Scan(&e.ID, &e.UserID, &e.SessionID, &e.Action, &e.IP, &e.UserAgent, &e.Geo, &e.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
