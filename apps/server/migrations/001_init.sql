-- +goose Up

-- Пользователи
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Сохранённые архитектуры
CREATE TABLE architectures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name TEXT NOT NULL,
    scenario_id TEXT,
    data JSONB NOT NULL,
    thumbnail_url TEXT,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Сценарии курса
CREATE TABLE scenarios (
    id TEXT PRIMARY KEY,
    lesson_number INT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    config JSONB NOT NULL,
    difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    tags TEXT[]
);

-- Результаты симуляций
CREATE TABLE simulation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    architecture_id UUID REFERENCES architectures(id),
    user_id UUID REFERENCES users(id),
    scenario_id TEXT REFERENCES scenarios(id),
    score INT,
    report JSONB NOT NULL,
    metrics JSONB NOT NULL,
    duration_sec INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Лидерборд
CREATE VIEW leaderboard AS
SELECT
    u.name,
    s.scenario_id,
    s.score,
    s.created_at,
    RANK() OVER (PARTITION BY s.scenario_id ORDER BY s.score DESC) AS rank
FROM simulation_results s
JOIN users u ON u.id = s.user_id;

-- Индексы
CREATE INDEX idx_architectures_user_id ON architectures(user_id);
CREATE INDEX idx_architectures_scenario_id ON architectures(scenario_id);
CREATE INDEX idx_simulation_results_user_id ON simulation_results(user_id);
CREATE INDEX idx_simulation_results_architecture_id ON simulation_results(architecture_id);
CREATE INDEX idx_simulation_results_scenario_id ON simulation_results(scenario_id);

-- +goose Down
DROP VIEW IF EXISTS leaderboard;
DROP TABLE IF EXISTS simulation_results;
DROP TABLE IF EXISTS architectures;
DROP TABLE IF EXISTS scenarios;
DROP TABLE IF EXISTS users;
