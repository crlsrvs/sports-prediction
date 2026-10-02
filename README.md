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

1. Open the web app and review **Partidos de hoy**.
2. Click **Analizar** to open match analysis (score estimate, factors, charts).
3. Open **Admin** to test sources, resolve entities, generate predictions, and run backtesting.

If PostgreSQL is unavailable, the API automatically falls back to a seeded in-memory store.

## Agent / contributor rules

See [`AGENTS.md`](./AGENTS.md). Architectural decisions live in [`docs/adr/`](./docs/adr/).
