-- +goose Up
ALTER TABLE users ALTER COLUMN gravatar_allowed SET DEFAULT true;
UPDATE users SET gravatar_allowed = true WHERE gravatar_allowed = false;

-- +goose Down
ALTER TABLE users ALTER COLUMN gravatar_allowed SET DEFAULT false;
