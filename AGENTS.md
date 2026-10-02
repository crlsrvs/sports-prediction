# Agent Guidelines & Development Conventions

## Project Overview

Sports analysis and prediction platform that ingests data from multiple sources, normalizes it into a common domain model, and produces explainable score estimates via a decoupled mathematical prediction engine.

- **MVP sport:** Football (UEFA Champions League, Premier League, La Liga)
- **Architecture target:** Sport-agnostic domain; later MLB and other sports
- **UI language:** Spanish initially; i18n-ready
- **Not in MVP:** Betting odds UI, auth/accounts, live predictions, LLM-generated analysis

### Strict Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript (strict), Vite, TanStack Query, Recharts |
| Backend API | NestJS, TypeScript (strict), REST |
| Workers / jobs | NestJS workers, BullMQ, Redis |
| Scraping | Playwright (Node/TypeScript) |
| Database | PostgreSQL (system of record) |
| Cache / queue | Redis + BullMQ |
| Initial deploy | Frontend → Vercel; PostgreSQL → Neon; Redis → Upstash; API/workers → free-tier compatible host |

**Monorepo layout (target):**

```text
apps/
  web/          # React + Vite
  api/          # NestJS REST API
  worker/       # BullMQ job runners
packages/
  domain/       # Shared domain models
  prediction/   # Prediction Engine (replaceable)
  scraping/     # Source adapters, fetchers, parsers
  normalization/
  database/
  shared/
```

**Prohibited by default:** Tailwind CSS / Sass / external UI kits unless an ADR explicitly allows them; LLMs for prediction explanations; hard dependencies on a single data vendor; inventing or imputing missing critical match data.

Consult `docs/adr/` before introducing new libraries, persistence layers, or architectural changes.

---

## Quick Commands

Prefer root npm scripts once the monorepo is bootstrapped. Until scripts exist, run the equivalent in the relevant workspace.

| Purpose | Command |
| --- | --- |
| Dev (all / watch) | `npm run dev` |
| Dev frontend | `npm run dev --workspace=apps/web` |
| Dev API | `npm run dev --workspace=apps/api` |
| Dev worker | `npm run dev --workspace=apps/worker` |
| Build | `npm run build` |
| Typecheck | `npm run typecheck` (or `npx tsc --noEmit`) |
| Lint | `npm run lint` |
| Test all | `npm test` (or `npx vitest run` / Jest per package) |
| Single test file | `npx vitest run <path-to-file>` or `npx jest <path-to-file>` |

---

## Architecture & Principles

### Pipeline

```text
Sources → Ingestion/Scraping → RAW (temporary) → Normalization → PostgreSQL
  → Feature Engine → Prediction Engine → NestJS API → React
```

Background work: Redis → BullMQ → Workers.

### Core Rules

1. **Source-agnostic:** Domain and prediction never depend on a specific provider. Each source is an adapter (`Fetcher` → `Parser` → `Normalizer`).
2. **Time-aware:** Predictions may only use data available at `dataCutoffAt`. No future leakage.
3. **Reproducible:** Predictions store `modelVersion`, feature snapshots, and cutoffs so results can be rebuilt.
4. **Explainable:** Factors come from deterministic mathematical rules, not LLMs.
5. **Modular:** Scraping, normalization, features, and prediction are separate packages/modules.
6. **Sport-agnostic domain:** Football-specific logic lives behind sport strategies; it must not pollute shared domain design.
7. **Replaceable models:** Frontend/API depend only on the prediction contract (e.g. `predictedScore`, `expectedGoals`, `confidence`, `factors`, `modelVersion`).
8. **Cheap by default:** Prefer APIs over scraping; cache; batch; avoid aggressive polling; respect rate limits and source terms.

### Feature-First & Co-location

Organize by feature/module, not by technical layer alone. Keep components, hooks, types, styles, and unit tests next to the code they exercise.

### State & Contracts

- Prefer explicit typed contracts (TypeScript strict; Zod/OpenAPI where APIs are shared).
- Do not use `any` in TypeScript.
- Keep Prediction Engine callable as a pure-ish module: `predictionEngine.predict(matchContext, featureSnapshot)`.
- Admin and public APIs stay separate; never leak internal scrape/parser failures as raw errors to end users.

### Data Rules (product-critical)

- RAW scrape payloads are temporary (retention ~7–30 days), not the long-term store.
- Entity aliases + matching resolve divergent team/player names to canonical entities.
- Minimum required data for a prediction: match, home/away teams, competition, historical results, recent form, home/away performance. Optional gaps lower confidence; missing required data → prediction unavailable (do not fabricate).

---

## Naming Conventions

| Kind | Convention | Examples |
| --- | --- | --- |
| Variables, functions, methods, hooks | camelCase | `getUserProfile`, `useMatchAnalysis` |
| Components, classes, interfaces, types | PascalCase | `MatchAnalysis`, `PredictionEngine` |
| DB columns, external API keys | snake_case | `user_profile_id`, `data_cutoff_at` |
| Global constants, env vars | SCREAMING_SNAKE_CASE | `MAX_RETRY_COUNT`, `DATABASE_URL` |
| Test files | `.spec.ts` / `.spec.tsx` (or `.test.tsx`) co-located | `predictionEngine.spec.ts` |

**Documentation:** Use TSDoc/JSDoc only for business intent, non-obvious logic, or side effects. Do not restate self-evident TypeScript types.

**Tests:** Arrange–Act–Assert (AAA). Co-locate with implementation.

---

## Git & Versioning Workflow

- **Branching:** GitHub Flow (feature branches → `main` via PRs).
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`). No AI attribution or Co-Authored-By.
- **Releases:** Semantic Versioning (SemVer); keep `CHANGELOG.md` (Keep a Changelog).

---

## Deterministic Verification Loop (Definition of Done)

Always follow this 4-step workflow:

1. **Implement:** Write clean, modular, strictly typed code that respects the contracts and principles above.
2. **Verify:** Before considering the task finished, run:
   - `npm run typecheck` (or `npx tsc --noEmit`)
   - `npm run lint`
   - `npm test` / relevant unit tests for changed files (AAA)
3. **Auto-fix:** If any verification step fails (non-zero exit), inspect errors, fix the root cause, and re-run until all pass (exit code 0).
4. **Complete:** Never deliver code or ask for human review with broken tests, lint errors, or type mismatches.

---

## Agent Context Rules

- `AGENTS.md` is the **only** operational source of truth for AI agents (vendor-agnostic).
- Do not create tool-proprietary rule files or folders (e.g. `CLAUDE.md`, `.cursor/` agent rules) as substitutes for this file.
- Prefer `docs/PRD.md` and `docs/adr/` for product and architectural rationale when decisions conflict with generic defaults.
- When conventions and the live stack disagree, **prefer the real project stack and unify the rule** in this file.
