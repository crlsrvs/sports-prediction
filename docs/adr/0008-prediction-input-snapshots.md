# ADR 0008: Persisted prediction inputs

## Status

Accepted. Implements the provenance requirements of ALFA-01.

## Context

Predictions stored outputs and a cutoff, but the analysis rebuilt features from
mutable history. A correction, team merge or later ingestion could therefore
change the comparison shown next to an unchanged prediction.

## Decision

- Add nullable `predictions.input_snapshot` (JSONB) through migration 007. Store
  the complete engine context: match, competition, teams, features, fitted
  ratings and cutoff. Both API generation paths and the worker write it.
- A model version identifies immutable prediction logic and constants. Current
  engines have no runtime configuration: fitted parameters (`rho`, advantage,
  attack/defense and availability adjustments) are in the snapshot. Changes to
  engine constants or prediction behavior must introduce a new model version;
  retain the previous implementation so its stored predictions can be replayed.
- Analysis uses stored features and identities when a prediction exists. It
  still uses the current match status and result for outcome comparison.
- Existing rows remain null; no inferred backfill is attributed to them. Their
  outputs and factors remain readable, but the original comparison is absent
  and the UI explains that the calculation is not reproducible.
- Snapshots freeze the inputs that the engine received, not the provider's
  historical knowledge. Calculations generated after kickoff are explicitly
  retrospective; a historical cutoff alone does not prove a pre-match forecast.
- Memory storage copies inputs to avoid reference mutations; PostgreSQL restores
  JSON dates to `Date` values on reading. No new library or persistence layer.

## Consequences

Rows are larger, but stored forecasts can be replayed without refitting against
today's history. Retaining temporary RAW payloads indefinitely is unnecessary.
Legacy forecasts cannot be made reproducible without their original inputs.
Pre-match refresh/version-selection policy is tracked separately in ALFA-02.
