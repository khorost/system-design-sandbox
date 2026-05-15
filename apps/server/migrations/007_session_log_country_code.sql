-- +goose Up
ALTER TABLE session_log ADD COLUMN country_code VARCHAR(2) DEFAULT '' NOT NULL;

-- +goose Down
ALTER TABLE session_log DROP COLUMN country_code;
