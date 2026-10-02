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
