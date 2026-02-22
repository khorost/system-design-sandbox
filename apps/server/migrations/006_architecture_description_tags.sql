-- +goose Up
ALTER TABLE architectures ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE architectures ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX idx_architectures_tags ON architectures USING GIN (tags);

-- +goose Down
DROP INDEX IF EXISTS idx_architectures_tags;
ALTER TABLE architectures DROP COLUMN tags;
ALTER TABLE architectures DROP COLUMN description;
