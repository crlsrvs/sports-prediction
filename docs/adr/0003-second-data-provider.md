# ADR 0003: football-data.org as current-season provider

## Status

Accepted

## Context

API-Football's free plan only exposes seasons 2022–2024. The model was validated on that history but the product had nothing upcoming to predict: the dashboard showed the latest finished matchday from May 2025. The architecture already mandates source-agnostic domain/prediction code and forbids hard dependencies on a single vendor.

## Decision

- Add `FootballDataAdapter` (`packages/scraping/src/footballData.ts`) against football-data.org v4 (free tier: tier-one competitions, 10 req/min) for the season in progress: scheduled fixtures and results.
- Keep API-Football for historical seasons. Both providers feed one provider-agnostic `ingestFixtures` through a `NormalizedFixture` shape.
- One competition catalogue (`TRACKED_COMPETITIONS`) with a column per provider identifier.
- Team identity across providers: `<provider>:<id>` aliases checked first, then conservative name matching (exact → normalized → club name without legal forms, unique only). Unmatched names create provisional teams queued for admin merge.
- Matches are deduplicated across providers by (competition, home team, away team, UTC day); the first provider's id and `source_id` win.
- "Real data" is any `source_id` other than the seed (`isLiveSourceId`), not a specific provider.

## Consequences

- Current-season fixtures and results arrive via `scrape-source`; batch prediction is limited to a 10-day horizon so predictions are fresh at kickoff.
- Admins must merge a handful of name variants after the first sync; promoted clubs without history legitimately stay unresolved.
- Adding a third provider is an adapter, a normalizer function, a catalogue column and a worker branch; no domain changes.
