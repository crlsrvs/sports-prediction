CREATE TABLE IF NOT EXISTS raw_records (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES data_sources(id),
  url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  status_code INTEGER NOT NULL,
  content_type TEXT,
  payload TEXT NOT NULL,
  checksum TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_raw_records_source_fetched
  ON raw_records (source_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  alias TEXT NOT NULL,
  source_id TEXT REFERENCES data_sources(id),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (alias, source_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_team
  ON entity_aliases (team_id);
