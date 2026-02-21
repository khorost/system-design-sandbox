-- +goose Up
ALTER TABLE users ADD COLUMN referral_source TEXT;

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS referral_source;
