ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS outcome_probabilities JSONB;

CREATE TABLE IF NOT EXISTS backtest_runs (
  id TEXT PRIMARY KEY,
  model_version TEXT NOT NULL,
  ran_at TIMESTAMPTZ NOT NULL,
  samples INTEGER NOT NULL,
  exact_score_rate DOUBLE PRECISION NOT NULL,
  winner_rate DOUBLE PRECISION NOT NULL,
  mae_goals DOUBLE PRECISION NOT NULL,
  brier_score DOUBLE PRECISION,
  log_loss DOUBLE PRECISION,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_model_ran
  ON backtest_runs (model_version, ran_at DESC);
