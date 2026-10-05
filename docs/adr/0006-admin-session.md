# ADR 0006: Admin session

## Status

Accepted. Extends the admin gate in [ADR 0004](./0004-ci-and-deployment-topology.md).

## Context

`ADMIN_TOKEN` plus `VITE_ADMIN_TOKEN` puts the secret inside the frontend bundle. Anyone who opens the admin JavaScript can read it. User accounts remain out of MVP scope (PRD), but the admin surface enqueues jobs and merges teams, so the secret should stay on the server.

## Decision

- `ADMIN_PASSWORD` (server only). `POST /admin/session` checks it and returns an HMAC token `v1.<expiry>.<mac>` valid for 12 hours. The key is the password itself, so rotating the password invalidates outstanding sessions.
- The browser stores that token in `sessionStorage` and sends it as `x-admin-token`. It is not a build-time variable.
- `ADMIN_TOKEN` remains as a static header for scripts and curl. Either credential satisfies `authorizeAdmin`.
- `GET /admin/session` is public and only reports whether a secret is configured (`required`, `passwordLogin`). Both empty means local admin stays open.
- The guard has no constructor parameters. Nest's `emitDecoratorMetadata` would otherwise treat them as injected providers and the API would not boot.

## Consequences

- This is still a shared password, not a user account. It does not cover the public site and it is not the V2 login from the PRD.
- A stolen session token works until it expires or the password changes. It never includes the password.
- Deployments that only set `ADMIN_TOKEN` keep working, including `VITE_ADMIN_TOKEN` baked into an old bundle. New deploys should set `ADMIN_PASSWORD` and leave the Vite token empty.
