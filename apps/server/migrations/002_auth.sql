-- +goose Up

-- Расширение таблицы пользователей
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending_verification', 'active', 'disabled'));
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN gravatar_allowed BOOLEAN NOT NULL DEFAULT false;

-- Промокоды для ограничения регистрации
CREATE TABLE promo_codes (
    code TEXT PRIMARY KEY,
    max_uses INT,
    used_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Аудит-лог сессий
CREATE TABLE session_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    session_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('login', 'logout', 'refresh', 'revoke')),
    ip TEXT,
    user_agent TEXT,
    geo TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_session_log_user_id ON session_log(user_id);
CREATE INDEX idx_session_log_session_id ON session_log(session_id);
CREATE INDEX idx_session_log_created_at ON session_log(created_at);

-- +goose Down
DROP TABLE IF EXISTS session_log;
DROP TABLE IF EXISTS promo_codes;
ALTER TABLE users DROP COLUMN IF EXISTS gravatar_allowed;
ALTER TABLE users DROP COLUMN IF EXISTS display_name;
ALTER TABLE users DROP COLUMN IF EXISTS status;
