# ADR 0001: Monorepo layout and initial stack

## Status

Accepted

## Context

The product needs a web UI, a REST API, background workers, scraping/normalization packages, and a replaceable prediction engine. Introducing libraries ad hoc would couple the domain to vendors and slow iteration.

## Decision

- Use an npm workspaces monorepo with `apps/*` and `packages/*`.
- Frontend: React + TypeScript + Vite + TanStack Query + Recharts.
- API: NestJS + TypeScript REST.
- Workers: BullMQ on Redis.
- Scraping: Playwright (added when the first web adapter is implemented).
- Database: PostgreSQL as system of record.
- Keep styles on native CSS Modules; no Tailwind/Sass/UI kit unless a later ADR supersedes this.
- Keep prediction explanations deterministic (no LLM).

## Consequences

- Shared contracts live in `@sports-prediction/domain` and `@sports-prediction/shared`.
- Feature engine / adapters / prediction stay replaceable behind package boundaries.
- Agents and contributors must consult `docs/adr/` before adding persistence libraries or UI frameworks.
