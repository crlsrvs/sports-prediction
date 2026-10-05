CREATE TABLE IF NOT EXISTS sports (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  sport_id TEXT NOT NULL REFERENCES sports(id),
  name TEXT NOT NULL,
  country TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  sport_id TEXT NOT NULL REFERENCES sports(id),
  canonical_name TEXT NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  sport_id TEXT NOT NULL REFERENCES sports(id),
  competition_id TEXT NOT NULL REFERENCES competitions(id),
  season_id TEXT,
  home_team_id TEXT NOT NULL REFERENCES teams(id),
  away_team_id TEXT NOT NULL REFERENCES teams(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  venue_id TEXT,
  status TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  source_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  generated_at TIMESTAMPTZ NOT NULL,
  data_cutoff_at TIMESTAMPTZ NOT NULL,
  model_version TEXT NOT NULL,
  predicted_home INTEGER NOT NULL,
  predicted_away INTEGER NOT NULL,
  expected_home DOUBLE PRECISION NOT NULL,
  expected_away DOUBLE PRECISION NOT NULL,
  confidence INTEGER NOT NULL,
  factors JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS data_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  health TEXT NOT NULL,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scraping_jobs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES data_sources(id),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  records_found INTEGER NOT NULL DEFAULT 0,
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS unresolved_entities (
  id TEXT PRIMARY KEY,
  incoming_name TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES data_sources(id),
  created_at TIMESTAMPTZ NOT NULL
);
