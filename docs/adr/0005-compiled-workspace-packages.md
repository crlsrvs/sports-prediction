# ADR 0005: Compiled workspace packages

## Status

Accepted. Replaces the runtime bullet of [ADR 0004](./0004-ci-and-deployment-topology.md).

## Context

The first image ran TypeScript with `tsx` because every workspace package exported `src/index.ts`. Images were about 500 MB and Nest decorators needed an explicit `--tsconfig`. The packages already compile with `tsc` (`outDir: dist`).

## Decision

- Each workspace package exports `default` → `./dist/index.js` and `source` → `./src/index.ts`. TypeScript keeps using the `types` condition, which still points at source, so `npm run typecheck` does not need a prior build.
- `npm run dev` for the API and the worker sets `NODE_OPTIONS=--conditions=source`, so local watch still loads TypeScript. Vitest aliases the packages to `src/` for the same reason. Vite dev and the web build use the `source` condition.
- `npm start` and the Docker image run `node apps/<app>/dist/main.js`. `scripts/build-all.mjs` builds dependencies before dependents. SQL migrations live in `packages/database/migrations` so both `src/store` and `dist/store` find them two directories up.
- The image copies only `dist/`, `package.json` and the migrations, then `npm prune --omit=dev`.

## Consequences

- A production process that forgets to build loads a missing `dist/` and exits. CI builds before the Docker job, and the image builds inside its own stage.
- Changing a package and running the API via `npm start` (not `dev`) requires a rebuild. `npm run dev` does not.
- Images drop to about 350 MB. They still include production `node_modules` for Nest, `pg` and BullMQ.
