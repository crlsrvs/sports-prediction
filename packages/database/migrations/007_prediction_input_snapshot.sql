-- No backfill: original inputs cannot be inferred honestly from today's data.
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS input_snapshot JSONB;
