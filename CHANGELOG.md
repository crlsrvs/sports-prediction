# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Monorepo foundation (`apps/web`, `apps/api`, `apps/worker`, shared packages).
- Domain contracts, football-v1 prediction engine, normalization helpers.
- Feature engine, seeded store (memory/Postgres), match analysis API, admin APIs.
- Web routes for today dashboard, match analysis, and admin panel.
- Docker Compose for PostgreSQL and Redis.
- Agent operating guide (`AGENTS.md`) and initial ADRs.
- Honest source testing, BullMQ job enqueue from admin, team resolve selector.
- Dashboard competition/status filters and seed/live data-mode banner.
- API-Football adapter, fixture ingest, RAW/alias tables, scrape/evaluate pipeline jobs.
- `football-v2` prediction engine: attack/defense ratings shrunk to league average,
  independent Poisson score distribution, most-probable score consistent with the
  implied winner, 1X2 probabilities and confidence calibrated from the distribution.
- Model registry (`getPredictionEngine`, `listModelVersions`, `DEFAULT_MODEL_VERSION`).
- Backtest metrics: multi-class Brier score, log loss, naive baselines, per-competition
  split and confidence calibration buckets; runs persisted in `backtest_runs`.
- Admin: model selector for backtests, backtest history, regenerate outdated predictions,
  `import-season` with season parameter; 1X2 probabilities shown in admin only.

- `football-v3` (Dixon-Coles): opponent-adjusted, time-decayed attack/defense ratings
  fitted jointly on all prior results (`fitDixonColes` in `@sports-prediction/features`),
  explicit home advantage, low-score correlation `rho` and league-average prior for
  thin histories. `FeatureSnapshot.ratings` carries the fitted ratings per match.

### Changed

- Default prediction model is now `football-v3` (`football-v1`/`v2` kept for comparison).
- Match comparison shows opponent-adjusted attack/defense ratings when available.
- `predictions` table gains `outcome_probabilities` (migration 003).
