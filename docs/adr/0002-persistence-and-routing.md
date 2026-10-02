# ADR 0002: Persistence driver and frontend routing

## Status

Accepted

## Context

The MVP needs durable canonical data (matches, predictions, admin entities) and multi-screen navigation (today, match analysis, admin).

## Decision

- Use the `pg` driver with explicit SQL migrations in `@sports-prediction/database`.
- Keep a seeded in-memory store as fallback when PostgreSQL is unavailable so local UI demos still work.
- Use `react-router` for frontend navigation between dashboard, analysis, and admin.

## Consequences

- No ORM lock-in; schema changes are reviewed as SQL.
- API repositories target a shared `AppStore` interface implemented by memory and Postgres.
- Adding TypeORM/Prisma later requires a new ADR.
