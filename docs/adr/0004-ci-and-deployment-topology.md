# ADR 0004: CI and deployment topology

## Status

Accepted

## Context

The product now has real data, a scheduler and a live scorecard, but it only runs on developer machines. The target stack fixes the managed pieces (Vercel, Neon, Upstash) and asks for a free-tier compatible host for the API and the worker. Two constraints shape the choice:

- Workspace packages are consumed from source (`main: ./src/index.ts`); there is no publish step and `node dist/main.js` cannot resolve them.
- `/admin/*` has no authentication (accounts are out of MVP scope), yet a public API must not let strangers enqueue jobs, burn provider quotas or merge teams.

## Decision

- **CI**: one GitHub Actions workflow (`.github/workflows/ci.yml`) runs `typecheck`, `lint`, `test` and `build` on every PR and push to `main`, then builds the API and worker Docker images without pushing them. Node version pinned in `.nvmrc`.
- **Runtime**: a single `Dockerfile` with `APP=api|worker` that installs the workspace and runs the entrypoint with `tsx --tsconfig apps/<app>/tsconfig.json` (TypeScript at runtime). No `dist/` is shipped. `npm start` in each app does the same locally.
- **Hosting**: Render Blueprint (`render.yaml`) declares the API as a Docker web service with `/health` as health check and the worker as a background worker. The blueprint is a convenience, not a lock-in: any host that runs a container with env vars works.
- **Frontend**: Vercel with root directory `apps/web` (`apps/web/vercel.json`); the API origin is baked at build time via `VITE_API_URL`. No server-side proxy.
- **Admin gate**: optional `ADMIN_TOKEN`. When set, `/admin/*` requires `x-admin-token` (`AdminTokenGuard`); the frontend sends `VITE_ADMIN_TOKEN`. Empty in development.

## Consequences

- Images are larger (~500 MB) and start slower than a compiled bundle; acceptable for the MVP. Compiling packages to `dist/` would require changing every `package.json` `exports` and is deferred.
- Secrets never live in the repo: `render.yaml` marks them `sync: false`, Vercel holds `VITE_*` values.
- `ADMIN_TOKEN` is a shared secret visible to anyone who opens the admin bundle; it stops drive-by abuse, not a determined user. Real authentication remains a V2 item and will need its own ADR.
- Render's free web service sleeps after inactivity; the first request after sleep is slow, but the worker (paid `starter` plan, or any always-on alternative) keeps the schedules running regardless.
