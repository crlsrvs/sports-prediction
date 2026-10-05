ALTER TABLE unresolved_entities
  ADD COLUMN IF NOT EXISTS provisional_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_matches_home_team ON matches (home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_team ON matches (away_team_id);
