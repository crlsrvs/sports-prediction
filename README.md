# Sports Prediction

Plataforma web de análisis y predicción deportiva. El MVP cubre fútbol (Champions League, Premier League y La Liga) con un motor matemático desacoplado y explicable.

## Estado del proyecto — 2026-11-03

**En preparación para `0.1.0-alpha.1`; todavía no lista para publicar.** Están implementados dashboard, análisis, administración, ingesta con dos proveedores, predicción Dixon–Coles, backtesting y evaluación de resultados.

- **ALFA-01 completado localmente:** API y worker guardan el contexto exacto de cada nueva predicción (migración 007); el análisis conserva sus features originales. Las predicciones anteriores sin snapshot y las reconstrucciones retrospectivas se identifican explícitamente.
- **Última validación:** typecheck, lint, build y 118 tests aprobados, incluidas tres comprobaciones con PostgreSQL temporal. [Evidencia y límites de esa ejecución](./docs/alpha-evidence/ALFA-01.md).
- **Pendiente:** actualización automática y conservación de pronósticos previos al inicio (ALFA-02), fallos/reintentos y vigencia de ingesta (ALFA-03), claridad de la información y revisión móvil (ALFA-04), protección de producción (ALFA-05) y validación integral/despliegue (ALFA-06).
- **Sin acreditar todavía:** flujo completo con Redis y proveedores reales, operación programada del candidato desplegado y precisión del modelo para esta versión. Los resultados históricos documentados no sustituyen esa validación.

El [plan del alfa](./docs/ALPHA_READINESS.md) contiene los criterios de terminado y el registro de avance. Este estado corresponde a la rama `codex/alpha-prediction-provenance` (implementación en `b95b235`); no acredita integración en `main` ni despliegue.

## Stack

- **Web:** React, TypeScript, Vite, TanStack Query, Recharts
- **API:** NestJS (REST)
- **Workers:** BullMQ + Redis
- **DB:** PostgreSQL
- **Ingesta:** adapters HTTP con `fetch` para API-Football y football-data.org; Playwright previsto para futuros adapters web

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

### Live data

Two free providers: **API-Football** for history (seasons 2022–2024) and **football-data.org** for the season in progress.

1. Set `API_FOOTBALL_KEY` and `FOOTBALL_DATA_KEY` in `.env`.
2. Start Redis (`docker compose up -d`) plus `npm run dev:api`, `npm run dev:worker`, and `npm run dev:web`.
3. In Admin, **Probar** each source, then enqueue `import-season` for 2022, 2023 and 2024 (6 leagues each; wait ~1 min between them) and `scrape-source` for the current season (fixtures + results, 6 requests).
4. Resolve duplicate teams in **Entidades sin resolver** (name variants between providers are merged automatically into one team), then **Regenerar todas (forzar)**.
5. The dashboard shows today's fixtures or the next matchday with predictions.

Both free tiers allow 10 requests/minute. See [docs/onboarding/03-datos-e-ingesta.md](./docs/onboarding/03-datos-e-ingesta.md).

### Prediction models

`football-v3` (Dixon-Coles) is the default; `football-v1` and `football-v2` are kept for comparison. Run and compare backtests from Admin → *Evaluación de modelos*. Details in [docs/onboarding/04-motor-de-prediccion.md](./docs/onboarding/04-motor-de-prediccion.md).

## Documentation

- **Alpha release checklist and progress:** [`docs/ALPHA_READINESS.md`](./docs/ALPHA_READINESS.md).
- **New here? Start with the [developer onboarding guide](./docs/onboarding/README.md)** (setup, architecture, data pipeline, prediction engine, API, database, workflow, glossary).
- Product requirements: [`docs/PRD.md`](./docs/PRD.md).
- Architectural decisions: [`docs/adr/`](./docs/adr/).
- Rules for contributors and AI agents: [`AGENTS.md`](./AGENTS.md).
