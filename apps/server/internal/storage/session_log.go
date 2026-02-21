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

// GetLoginInfoBySessionIDs returns the login log entry for each session ID (most recent login per session).
// Result is a map from session_id to SessionLogEntry.
func (s *Storage) GetLoginInfoBySessionIDs(ctx context.Context, sessionIDs []string) (map[string]model.SessionLogEntry, error) {
	if len(sessionIDs) == 0 {
		return map[string]model.SessionLogEntry{}, nil
	}
	rows, err := s.Pool.Query(ctx,
		`SELECT DISTINCT ON (session_id) session_id, ip, user_agent, geo, created_at
		 FROM session_log
		 WHERE session_id = ANY($1) AND action = 'login'
		 ORDER BY session_id, created_at DESC`,
		sessionIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]model.SessionLogEntry, len(sessionIDs))
	for rows.Next() {
		var e model.SessionLogEntry
		if err := rows.Scan(&e.SessionID, &e.IP, &e.UserAgent, &e.Geo, &e.CreatedAt); err != nil {
			return nil, err
		}
		result[e.SessionID] = e
	}
	return result, rows.Err()
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
