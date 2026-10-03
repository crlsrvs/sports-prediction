# Sports Prediction

Plataforma web de análisis y predicción deportiva. El MVP cubre fútbol (Champions League, Premier League y La Liga) con un motor matemático desacoplado y explicable.

## Stack

- **Web:** React, TypeScript, Vite, TanStack Query, Recharts
- **API:** NestJS (REST)
- **Workers:** BullMQ + Redis
- **DB:** PostgreSQL
- **Scraping:** Playwright (cuando se activen adapters web)

## Monorepo

```text
apps/web        Frontend
apps/api        NestJS API
apps/worker     BullMQ workers
packages/*      domain, prediction, scraping, normalization, database, shared
```

## Quick start

```bash
cp .env.example .env
docker compose up -d
npm install
npm run typecheck
npm run lint
npm test
```

### Dev servers

```bash
npm run dev:api   # http://localhost:3000
npm run dev:web   # http://localhost:5173 (proxy /api → API)
npm run dev:worker
```

### MVP flow

1. Open the web app and review **Partidos de hoy** (seed demo by default).
2. Click **Analizar** to open match analysis (score estimate, factors, charts).
3. Open **Admin** to test sources, enqueue jobs, resolve entities, generate predictions, and run backtesting.

Leave `DATABASE_URL` empty to run on a seeded in-memory store (demo mode). If `DATABASE_URL` is set but unreachable, API and worker refuse to start; set `STORE_ALLOW_MEMORY_FALLBACK=true` only for demos. `GET /health` reports the active store.

### Live data (API-Football)

1. Set `API_FOOTBALL_KEY` in `.env` (optional: `API_FOOTBALL_SEASON=2024`).
2. Start Redis (`docker compose up -d`) plus `npm run dev:api`, `npm run dev:worker`, and `npm run dev:web`.
3. In Admin, **Probar** the API-Football source, then enqueue `import-season` for 2022, 2023 and 2024 (6 leagues each; wait ~1 min between them to respect the free-plan rate limit).
4. Click **Regenerar todas (forzar)** so every prediction uses the full history.
5. The dashboard banner switches from seed demo to live and shows the latest real matchday per league.

**Free-plan limits:** seasons 2022–2024 only, no current season, no `last`/`next`, `?date=` only within a ~3-day window. See [docs/onboarding/03-datos-e-ingesta.md](./docs/onboarding/03-datos-e-ingesta.md).

### Prediction models

`football-v3` (Dixon-Coles) is the default; `football-v1` and `football-v2` are kept for comparison. Run and compare backtests from Admin → *Evaluación de modelos*. Details in [docs/onboarding/04-motor-de-prediccion.md](./docs/onboarding/04-motor-de-prediccion.md).

## Documentation

- **New here? Start with the [developer onboarding guide](./docs/onboarding/README.md)** (setup, architecture, data pipeline, prediction engine, API, database, workflow, glossary).
- Product requirements: [`docs/PRD.md`](./docs/PRD.md).
- Architectural decisions: [`docs/adr/`](./docs/adr/).
- Rules for contributors and AI agents: [`AGENTS.md`](./AGENTS.md).
