-- +goose Up
ALTER TABLE architectures DROP COLUMN data;
ALTER TABLE architectures ADD COLUMN data BYTEA NOT NULL DEFAULT '\x';
ALTER TABLE architectures ALTER COLUMN data SET STORAGE EXTERNAL;

-- +goose Down
ALTER TABLE architectures DROP COLUMN data;
ALTER TABLE architectures ADD COLUMN data JSONB NOT NULL DEFAULT '{}';
