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

If PostgreSQL is unavailable, the API automatically falls back to a seeded in-memory store.

### Live data (API-Football)

1. Set `API_FOOTBALL_KEY` in `.env` (optional: `API_FOOTBALL_SEASON=2024`).
2. Start Redis (`docker compose up -d`) plus `npm run dev:api`, `npm run dev:worker`, and `npm run dev:web`.
3. In Admin, **Probar** the API-Football source, then enqueue `scrape-source` and `generate-predictions`.
4. The dashboard banner switches from seed demo to live when fixtures from that source exist.

**Free-plan limits:** only a ~3-day date window, no `last`/`next`, and seasons above 2024 are blocked. If PL/UCL/La Liga have no fixtures that day, the app stays on seed demo until a matchday or a paid plan.

## Agent / contributor rules

See [`AGENTS.md`](./AGENTS.md). Architectural decisions live in [`docs/adr/`](./docs/adr/).
