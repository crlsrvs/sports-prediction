ALTER TABLE prediction_evaluations
  ADD COLUMN IF NOT EXISTS outcome_probabilities JSONB;

CREATE TABLE IF NOT EXISTS player_absences (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  match_day TIMESTAMPTZ NOT NULL,
  known_at TIMESTAMPTZ NOT NULL,
  source_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_lineups (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  match_day TIMESTAMPTZ NOT NULL,
  known_at TIMESTAMPTZ NOT NULL,
  source_id TEXT NOT NULL,
  player_names JSONB NOT NULL
);
