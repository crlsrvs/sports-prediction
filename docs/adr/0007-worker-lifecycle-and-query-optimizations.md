# ADR 0007: Worker store reuse, job options and query preloading

## Status

Accepted. Builds on [ADR 0001](./0001-monorepo-and-stack.md) and [ADR 0002](./0002-persistence-and-routing.md).

## Context

Creating an AppStore for every job opens additional PostgreSQL pools and repeats migration checks. Loading teams, competitions, history and predictions inside match loops also repeats database reads. These patterns add connection and query overhead; this change has no production incident report or measured performance benchmark attached.

The API previously reflected arbitrary CORS origins. Queue settings and frontend query freshness also needed explicit defaults.

## Decision

- **Worker store reuse:** `apps/worker/src/main.ts` initializes one AppStore at bootstrap and passes it to `runPipelineJob(name, data, store)`. Sequential ad-hoc callers without an override reuse a module-level store. Each process owns its own store and PostgreSQL pool; API and worker do not share an in-memory store.
- **Pipeline preloading:** `generatePredictions` preloads matches, competitions, teams, availability and predictions. `evaluatePredictions` preloads matches, data mode, evaluations and predictions. Both resolve latest predictions in memory and retain per-record writes.
- **Dashboard preloading:** `AnalysisPreload` passes entity maps, history, availability and `RatingsCache` from `listTodayCards()` into card analysis. Missing predictions can still require individual reads and writes. Preloading reduces repeated reads; it does not eliminate every per-match query.
- **Match filtering:** `AppStore.listMatches(filter?: MatchFilter)` supports status equality, an inclusive `scheduledAt >= since`, and a positive limit after ascending kickoff ordering. PostgreSQL uses query parameters; MemoryStore implements the same filtering. `loadHistory()` requests finished matches. No new status/date index is introduced by this change.
- **CORS:** `ALLOWED_ORIGINS` is a comma-separated list, with localhost and 127.0.0.1 origins on ports 5173 and 3000 as the unset-variable fallback. The API enables credentials. Production must explicitly configure the frontend origin. `*` is accepted by the implementation but is unsuitable for browser requests using credential mode. CORS is a browser access policy, not authentication or a complete CSRF defense; the admin guard still controls authorization.
- **Job options:** `DEFAULT_JOB_OPTIONS` sets 3 total attempts (initial attempt plus up to 2 retries), exponential backoff starting at 5 seconds, retention of 100 completed jobs and 50 failed jobs. The API applies these to enqueued jobs. The worker scheduler queue has the same defaults; scheduler templates explicitly set retention.
- **Frontend caching:** TanStack Query uses `staleTime: 60_000` and `retry: 1`. Freshness reduces mount/focus refetches during the freshness window, but invalidation and polling remain active. Admin jobs poll every 15 seconds, health every 30 seconds, and schedules every 60 seconds.

## Consequences and limits

- Worker jobs reuse the configured connection pool instead of creating one per execution. Graceful shutdown and simultaneous first-use initialization for ad-hoc callers are not addressed here.
- Database reads are reduced by preloading, at the cost of holding full result sets in memory. No percentage reduction or latency improvement has been measured.
- BullMQ retries uncaught processor errors. Provider errors caught and returned as `failed:...` details or warnings can complete the job without retrying. Database scraping-job records and retained BullMQ jobs are separate views.
- Recurring generation fills missing predictions; it does not refresh existing ones. Administrative regeneration remains necessary after model or history changes.
- Stored predictions include results, factors, model version and cutoff, but not the complete feature snapshot or training history. Exact reproduction after data corrections remains pending.
- Existing callers remain compatible through optional filter and preload parameters. The changes do not add user accounts, new persistence libraries or a new prediction model.

## Verification

Match filtering and shared job options have co-located unit tests. Run `npm run typecheck`, `npm run lint` and `npm test` before delivery. These checks do not substitute for PostgreSQL/Redis integration tests, production load tests or browser CORS checks against a deployed frontend.
