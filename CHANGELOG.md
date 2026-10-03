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
- football-data.org adapter for the season in progress (fixtures + results) run by
  `scrape-source`; provider-agnostic `ingestFixtures` over `NormalizedFixture` with
  cross-provider match deduplication; single `TRACKED_COMPETITIONS` catalogue;
  `FOOTBALL_DATA_KEY`. Dashboard shows today's fixtures or the next matchday;
  batch prediction limited to a 10-day horizon. ADR 0003.
- Entity matcher third pass: club name without legal forms/years, unique matches only;
  nordic transliteration (`ø` → `o`).
- Team merge: resolving a pending entity now merges the provisional `team-af-*` team
  into the chosen one (matches re-pointed, aliases combined); `POST /admin/teams/merge`
  and an Admin form for arbitrary duplicates. Ingest matches by `api-football:<id>`
  alias before falling back to name matching. Migration `004`.
- Backtest metrics: multi-class Brier score, log loss, naive baselines, per-competition
  split and confidence calibration buckets; runs persisted in `backtest_runs`.
- Admin: model selector for backtests, backtest history, regenerate outdated predictions,
  `import-season` with season parameter; 1X2 probabilities shown in admin only.

- `football-v3` (Dixon-Coles): opponent-adjusted, time-decayed attack/defense ratings
  fitted jointly on all prior results (`fitDixonColes` in `@sports-prediction/features`),
  explicit home advantage, low-score correlation `rho` and league-average prior for
  thin histories. `FeatureSnapshot.ratings` carries the fitted ratings per match.

- Support leagues (Bundesliga, Serie A, Ligue 1) ingested as inactive competitions so
  European opponents carry opponent-adjusted ratings; public catalogue, dashboard,
  backtests and regeneration only cover featured competitions.
- Dixon-Coles newcomer prior (`priorAttack` 0.9 / `priorDefense` 1.1) for teams with
  thin history; forced regeneration of predictions from Admin.

- Developer onboarding guide in `docs/onboarding/` (setup, architecture, data pipeline,
  prediction engine, API/frontend, database, workflow, glossary).

- Job scheduler: `JOB_SCHEDULES` (shared) registered by the worker as BullMQ job
  schedulers (`sync-and-predict` every 6 h chaining scrape → generate → evaluate,
  `cleanup-raw-weekly`); `JOB_SCHEDULER_ENABLED` opt-out, `GET /admin/schedules`,
  `POST /admin/jobs { chain }` and an Admin "Programación" section.

- Live-season evaluation: `evaluate-predictions` persists per-prediction outcomes
  (1X2 hit, exact score, Brier, log loss, `generated_before_kickoff`) in
  `prediction_evaluations` (migration 005); `GET /admin/evaluations/summary` and an
  Admin "Temporada en vivo" panel separate from the backtest.

### Fixed

- Demo (seed) results no longer contaminate ratings or backtests once real data exists.
- API/worker fail fast with `StoreConnectionError` when `DATABASE_URL` is set but
  unreachable instead of silently serving demo data; opt-in fallback via
  `STORE_ALLOW_MEMORY_FALLBACK`. `GET /health` reports the active store and reason.
- Running a backtest is now `POST /admin/backtests`; `GET /admin/backtests` is read-only
  (replaces `GET /admin/backtests/history`).

### Changed

- Default prediction model is now `football-v3` (`football-v1`/`v2` kept for comparison).
- Match comparison shows opponent-adjusted attack/defense ratings when available.
- `predictions` table gains `outcome_probabilities` (migration 003).
