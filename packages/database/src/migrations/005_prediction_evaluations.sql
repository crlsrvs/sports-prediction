CREATE TABLE IF NOT EXISTS prediction_evaluations (
  prediction_id TEXT PRIMARY KEY REFERENCES predictions(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL REFERENCES matches(id),
  model_version TEXT NOT NULL,
  competition_id TEXT NOT NULL REFERENCES competitions(id),
  kickoff_at TIMESTAMPTZ NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  generated_before_kickoff BOOLEAN NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL,
  confidence INTEGER NOT NULL,
  predicted_home INTEGER NOT NULL,
  predicted_away INTEGER NOT NULL,
  actual_home INTEGER NOT NULL,
  actual_away INTEGER NOT NULL,
  predicted_outcome TEXT NOT NULL,
  actual_outcome TEXT NOT NULL,
  exact_score BOOLEAN NOT NULL,
  winner_hit BOOLEAN NOT NULL,
  brier_score DOUBLE PRECISION,
  log_loss DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_prediction_evaluations_model_kickoff
  ON prediction_evaluations (model_version, kickoff_at DESC);
