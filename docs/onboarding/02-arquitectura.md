# 2. Arquitectura

## La idea en una frase

Ingerimos resultados de fuentes externas, los normalizamos a un modelo de dominio común, calculamos *features* respetando un corte temporal, y un motor matemático reemplazable produce un marcador estimado con factores explicativos. Todo es reproducible y nada depende de un proveedor concreto.

## Pipeline

```text
 Fuentes externas          Ingesta / Scraping           RAW (temporal)
 (API-Football hoy;   ──►  Fetcher → Parser → Ingest ──►  raw_records
  Playwright después)                                     (7–30 días)
                                 │
                                 ▼
                           Normalización
                    (aliases, ids canónicos, status)
                                 │
                                 ▼
                      PostgreSQL (sistema de registro)
                  teams · matches · predictions · ...
                                 │
                                 ▼
                          Feature Engine
          buildFinishedHistory → fitDixonColes → buildFeatureSnapshot
                                 │
                                 ▼
                        Prediction Engine
             getPredictionEngine(modelVersion).predict(ctx, snapshot)
                                 │
                                 ▼
                  API NestJS (REST)  ──►  React (Vite)
```

El trabajo en segundo plano corre por **Redis → BullMQ → Worker**. La API solo *encola* jobs; el worker los ejecuta.

## Principios que no se negocian

Están en `AGENTS.md`; aquí el porqué de cada uno:

1. **Agnóstico de fuente.** Ningún tipo de `domain`, `features` o `prediction` conoce API-Football. Si mañana cambiamos de proveedor, solo se toca `packages/scraping`.
2. **Consciente del tiempo.** Toda predicción tiene un `dataCutoffAt` y solo usa información anterior a ese instante. Es lo que hace honesto el backtesting: predecimos el pasado "sin saber el futuro".
3. **Reproducible.** Guardamos `modelVersion`, `dataCutoffAt`, `expectedGoals`, `outcomeProbabilities` y `factors`. Con eso y el historial se puede reconstruir cualquier predicción.
4. **Explicable y determinista.** Los factores salen de reglas matemáticas, nunca de un LLM. Misma entrada → misma salida.
5. **Modular.** Scraping, normalización, features y predicción son paquetes separados con dependencias en una sola dirección.
6. **Dominio agnóstico de deporte.** Lo específico de fútbol vive en los motores `footballVx` y en el adapter; `domain` no tiene nada de "goles" salvo en nombres de campos genéricos (`homeScore`).
7. **Modelos reemplazables.** API y web dependen del contrato `Prediction`, no de un algoritmo.
8. **Barato por defecto.** Preferimos APIs a scraping, cacheamos, no hacemos polling agresivo, respetamos límites de uso.

## Monorepo

```text
apps/
  web/        React + Vite + TanStack Query + Recharts + CSS Modules
  api/        NestJS REST (público + admin)
  worker/     BullMQ: ejecuta los jobs del pipeline
packages/
  domain/         Entidades, ids tipados, MatchContext, contratos de análisis
  shared/         Result<T,E>, nombres de jobs, constantes, dixonColesTau
  features/       Historial, ratings Dixon-Coles, FeatureSnapshot
  prediction/     Motores football-v1/v2/v3, Poisson, evaluación, registro de modelos
  scraping/       Adapter API-Football, ingest de fixtures, catálogo de ligas
  normalization/  Matching de nombres de equipos por alias
  database/       AppStore (interfaz), MemoryStore, PostgresStore, migraciones SQL, seed
```

Todos los paquetes se llaman `@sports-prediction/<nombre>` y se importan por ese nombre. En desarrollo se consumen directamente desde `src/` (sin build) gracias a `tsx` y a los `exports` de cada `package.json`.

### Grafo de dependencias

```text
          shared ◄──────────────┐
            ▲                   │
            │                   │
          domain ◄──────┬───────┼──────────┐
            ▲           │       │          │
            │           │       │          │
        features    prediction  normalization
            ▲           ▲          ▲
            │           │          │
            │           │       scraping
            │           │          ▲
          database ◄────┼──────────┤
            ▲           │          │
            └───── api ─┴── worker ┘
                    ▲
                   web (solo tipos de domain)
```

Reglas: `domain` y `shared` no dependen de nadie. `features`, `prediction`, `normalization` solo de `domain`/`shared`. `scraping` puede usar `normalization`. `database` depende de `domain`/`shared`. Las apps dependen de lo que necesiten. **Nunca** un paquete depende de una app, ni `prediction` de `features` (el contrato entre ambos es `FeatureSnapshot`, que vive en `domain`).

## Qué hace cada paquete

### `packages/domain`

- `entities.ts`: `Sport`, `Competition`, `Team`, `Match`, `Prediction`, `PredictionFactor`, `FeatureSnapshot`, `MatchRatings`, `OutcomeProbabilities`, `MatchOutcome`.
- `ids.ts`: ids *branded* (`TeamId`, `MatchId`, ...) con constructores `asTeamId()` etc. Impiden pasar un `MatchId` donde va un `TeamId`.
- `matchContext.ts`: `MatchContext` (todo lo que ve el motor) y `hasMinimumPredictionData()` (regla de producto: sin datos mínimos no hay predicción, no se inventa).
- `analysis.ts`: contratos de salida hacia la UI: `MatchCard`, `MatchAnalysis`, `PredictionEvaluation`, `TeamComparisonMetric`.

### `packages/shared`

- `Result<T, E>` con `ok()`/`err()`: los motores no lanzan excepciones, devuelven `Result`.
- `JOB_NAMES`, `DEFAULT_QUEUE_NAME`, `API_FOOTBALL_SOURCE_ID`, `SEED_SOURCE_ID`, `MAX_RAW_RETENTION_DAYS`.
- `dixonColesTau`: la corrección de marcadores bajos, compartida entre `features` (ajuste) y `prediction` (distribución).

### `packages/features`

- `buildFinishedHistory(matches)`: filtra partidos terminados con marcador, ordena por fecha y **descarta los resultados seed en cuanto hay datos reales**.
- `fitDixonColes({ history, cutoffAt, options })`: ajusta ratings de ataque/defensa de todos los equipos, ventaja de local y ρ usando solo resultados anteriores al corte.
- `buildFeatureSnapshot({...})`: forma reciente, promedios de goles, descanso, y los `ratings` si se le pasan.

### `packages/prediction`

- `footballV1.ts`, `footballV2.ts`, `footballV3.ts`: los motores. Todos exponen `predict(matchContext, featureSnapshot): Result<PredictionOutput, PredictionUnavailableReason>`.
- `poisson.ts`: `poissonPmf`, `buildScoreDistribution(λ, μ, maxGoals, ρ)`, `argmaxOutcome`.
- `evaluatePrediction.ts`: acierto exacto, acierto de ganador, Brier, log loss.
- `engine.ts`: registro de modelos. `DEFAULT_MODEL_VERSION`, `getPredictionEngine(version)`, `listModelVersions()`, `predictionEngine` (el default).

### `packages/scraping`

- `apiFootball.ts`: `ApiFootballAdapter` (fetch con cabecera `x-apisports-key`, RAW con checksum), catálogo `API_FOOTBALL_COMPETITIONS` (ligas *featured* y *support*), helpers de temporada.
- `ingestFixtures.ts`: convierte fixtures del proveedor en `Team`/`Match` del dominio, resolviendo nombres por alias y creando ids `team-af-<id>` / `match-af-<id>`.

### `packages/normalization`

- `matchTeamByAlias(name, teams)`: coincidencia exacta o por texto normalizado (minúsculas, sin acentos ni puntuación). Devuelve `confidence` y `reason`.

### `packages/database`

- `store/types.ts`: la interfaz `AppStore`. Es el **único** contrato de persistencia que conocen API y worker.
- `store/memoryStore.ts`: implementación en memoria, usada en tests y como fallback.
- `store/postgresStore.ts`: implementación `pg`, con `migrate()` y `seedIfEmpty()`.
- `store/seed.ts`: datos de demostración (3 competiciones, 8 equipos, 26 resultados ficticios, 3 partidos programados).
- `migrations/*.sql`: esquema versionado.
- `createStore.ts`: `createAppStore(env)` decide entre Postgres y memoria; falla con `StoreConnectionError` si la base configurada no responde (fallback a memoria solo con `STORE_ALLOW_MEMORY_FALLBACK=true`).

### `apps/api`

NestJS con módulos por feature: `health`, `sports`, `matches`, `analysis`, `admin`, `jobs`, `store`. `AnalysisService` es el corazón: construye cards, análisis, regenera predicciones y ejecuta backtests. `StoreModule` es global e inyecta `AppStore` con el token `STORE`.

### `apps/worker`

Un `Worker` de BullMQ sobre la cola `sports-prediction` que delega en `runPipelineJob(name, data)` (`pipeline.ts`). Cada `case` del `switch` es un job. Si añades un job nuevo y olvidas el `case`, el `never` exhaustivo rompe el typecheck a propósito.

### `apps/web`

Organizado por *features* (`today`, `analysis`, `admin`), cada una con componente, estilos `.module.css` y tests al lado. `shared/api.ts` es el único punto de acceso HTTP (tipado), `shared/format.ts` formateadores. Estado de servidor con TanStack Query; no hay estado global adicional.

## Contratos clave

### `Prediction` (lo que persiste y ve la UI)

```ts
interface Prediction {
  id: PredictionId;
  matchId: MatchId;
  generatedAt: Date;
  dataCutoffAt: Date;
  modelVersion: string;              // 'football-v3'
  predictedScore: { home; away };    // marcador titular
  expectedGoals: { home; away };     // λ, μ
  confidence: number;                // 0–100, = P(resultado predicho) en v2/v3
  factors: PredictionFactor[];       // explicación determinista, ordenada por impacto
  outcomeProbabilities: { home; draw; away } | null;  // null en v1
}
```

### `FeatureSnapshot` (lo que entra al motor)

Forma reciente (`homeForm: ['W','D','L',...]`), promedios de goles a favor/en contra, `homeStrength`/`awayStrength`, días de descanso, `injuryImpact*` y `squadChange*` (hoy siempre 0: no tenemos esa fuente), `dataCompleteness` (0–0.95) y `ratings: MatchRatings | null` (Dixon-Coles). Siempre lleva su propio `dataCutoffAt`; el motor rechaza snapshots cuyo corte sea posterior al del contexto (`invalid_cutoff`).

### `AppStore`

Interfaz con ~30 métodos agrupados por entidad (`listMatches`, `upsertMatch`, `getLatestPrediction`, `savePrediction`, `saveRawRecord`, `listEntityAliases`, `saveBacktestRun`, `getDataMode`...). Si necesitas persistir algo nuevo: añade el método a `types.ts`, impleméntalo en **ambos** stores y, si hace falta tabla, escribe la migración.

## Modos de datos: `seed` vs `live`

`store.getDataMode()` devuelve `live` si existe al menos un partido con `sourceId = source-api-football`; si no, `seed`. La UI muestra un banner distinto en cada caso y `buildFinishedHistory` descarta los resultados seed en modo `live` para que no contaminen los ratings.

## Competiciones *featured* y *support*

`Competition.active` separa lo que se muestra de lo que solo alimenta el modelo:

- **featured** (`active: true`): UCL, Premier, La Liga. Aparecen en `/competitions`, dashboard, backtests y regeneración.
- **support** (`active: false`): Bundesliga, Serie A, Ligue 1. Sus partidos entran en el historial para que los rivales europeos tengan ratings con base doméstica, pero no se muestran ni se evalúan.

Esta distinción se decide en `API_FOOTBALL_COMPETITIONS` (`packages/scraping/src/apiFootball.ts`) y se materializa al importar temporadas.

## Decisiones registradas (ADR)

- [0001](../adr/0001-monorepo-and-stack.md): monorepo npm workspaces y stack (React/Vite, NestJS, BullMQ, Postgres, CSS Modules, sin LLM).
- [0002](../adr/0002-persistence-and-routing.md): driver `pg` con migraciones SQL, store en memoria como fallback, `react-router`.

Si vas a introducir una librería, un almacén o cambiar una frontera entre paquetes, escribe un ADR nuevo con el mismo formato (Status / Context / Decision / Consequences) antes del código.
