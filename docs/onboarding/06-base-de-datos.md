# 6. Base de datos y persistencia

## Estrategia

- PostgreSQL es el sistema de registro. Driver `pg` directo, **sin ORM** (ADR 0002).
- El esquema se versiona en SQL plano: `packages/database/migrations/NNN_nombre.sql` (fuera de `src/`, para que lo encuentre tanto el código fuente como `dist/`).
- Las migraciones son idempotentes (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) y se ejecutan **todas, en orden, en cada arranque** de API y worker (`PostgresStore.migrate(pool)`). No hay tabla de control de versiones; la idempotencia es la garantía.
- `createAppStore()` elige el store: sin `DATABASE_URL` → memoria sembrada (demo explícito); con `DATABASE_URL` alcanzable → Postgres; con `DATABASE_URL` inalcanzable → lanza `StoreConnectionError` (API y worker no arrancan) salvo que `STORE_ALLOW_MEMORY_FALLBACK=true`, en cuyo caso cae a memoria avisando. El modo y el motivo se exponen en `GET /health`.

## Tablas

Convención: columnas en `snake_case`; en TypeScript, `camelCase`. El mapeo vive en las funciones `map*` de `postgresStore.ts`.

### Catálogo

| Tabla | Clave | Columnas relevantes |
|---|---|---|
| `sports` | `id` | `name`, `slug`, `active` |
| `competitions` | `id` | `sport_id`, `name`, `country`, `active` (**featured** si `true`; **support** si `false`) |
| `teams` | `id` | `sport_id`, `canonical_name`, `aliases` (`JSONB` array de strings) |

Ids son texto legible: `sport-football`, `comp-pl`, `team-af-50`, `team-barcelona` (seed).

### Partidos y predicciones

| Tabla | Clave | Columnas relevantes |
|---|---|---|
| `matches` | `id` | `sport_id`, `competition_id`, `season_id` (null hoy), `home_team_id`, `away_team_id`, `scheduled_at`, `venue_id`, `status`, `home_score`, `away_score`, `source_id`, `created_at`, `updated_at` |
| `predictions` | `id` | `match_id`, `generated_at`, `data_cutoff_at`, `model_version`, `predicted_home`, `predicted_away`, `expected_home`, `expected_away`, `confidence`, `factors` (`JSONB`), `outcome_probabilities` (`JSONB`, nullable) |

Un partido puede tener **muchas** predicciones (una por generación/modelo). `getLatestPrediction(matchId)` devuelve la más reciente por `generated_at`. Las regeneraciones añaden predicciones y conservan las anteriores como historial. Se guardan salida, factores, versión y corte, pero no el `FeatureSnapshot` completo ni una copia del historial utilizado; la reproducción exacta sigue pendiente si los datos cambian.

Ids de partido: `match-af-<fixtureId>` (API-Football), `match-fd-<id>` (football-data.org), `hist-*` / `match-*` (seed). Un partido visto por los dos proveedores conserva el id y `source_id` del primero que lo creó.

### Operación e ingesta

| Tabla | Para qué |
|---|---|
| `data_sources` | fuentes con `kind`, `active`, `health` (`healthy`/`warning`/`broken`/`disabled`), `last_success_at`, `last_failure_at`, `consecutive_failures` |
| `scraping_jobs` | una fila por ejecución: `source_id`, `started_at`, `finished_at`, `status` (`queued`/`running`/`success`/`partial`/`failed`/`skipped`), `records_found/processed/failed`, `error` |
| `raw_records` | payload crudo: `source_id`, `url`, `fetched_at`, `status_code`, `content_type`, `payload`, `checksum`, `metadata` (`JSONB`). Retención 30 días |
| `unresolved_entities` | nombres de equipo que el ingest no pudo mapear: `incoming_name`, `source_id`, `created_at`, `provisional_team_id` (FK a `teams`, `ON DELETE SET NULL`). Al resolver, el equipo provisional se fusiona en el elegido, la fila se **borra** y el alias se añade a `teams.aliases` |
| `entity_aliases` | `alias` → `team_id`, con `source_id` y `created_at`; `UNIQUE (alias, source_id)`. Preparada para registrar aliases por fuente; hoy el store expone `upsertEntityAlias`/`listEntityAliases` pero el ingest todavía resuelve con `teams.aliases` y nadie escribe en esta tabla |
| `backtest_runs` | `model_version`, `ran_at`, `samples`, `exact_score_rate`, `winner_rate`, `mae_goals`, `brier_score`, `log_loss`, `details` (`JSONB`: `byCompetition`, `baselines`, `calibration`) |
| `prediction_evaluations` | una fila por predicción evaluada (`prediction_id` PK, cascade al borrar la predicción): `match_id`, `model_version`, `competition_id`, `kickoff_at`, `generated_at`, `generated_before_kickoff`, marcador predicho/real, `predicted_outcome`/`actual_outcome`, `exact_score`, `winner_hit`, `brier_score`, `log_loss`, `outcome_probabilities`. Índice por `(model_version, kickoff_at desc)` |
| `player_absences` | baja conocida: `team_id`, `player_name`, `reason`, `match_day`, `known_at` (la primera vez que la vimos), `source_id` |
| `team_lineups` | alineación conocida: `team_id`, `match_day`, `known_at`, `player_names`, `source_id` |

### Migraciones existentes

| Archivo | Contenido |
|---|---|
| `001_init.sql` | sports, competitions, teams, matches, predictions, data_sources, scraping_jobs, unresolved_entities |
| `002_raw_and_aliases.sql` | raw_records, entity_aliases |
| `003_probabilities_and_backtests.sql` | `predictions.outcome_probabilities`, backtest_runs |
| `004_unresolved_provisional_team.sql` | `unresolved_entities.provisional_team_id`, índices en `matches(home_team_id)` / `matches(away_team_id)` |
| `005_prediction_evaluations.sql` | tabla `prediction_evaluations` (evaluación persistida de la temporada en vivo) |
| `006_evaluation_probabilities_and_availability.sql` | `prediction_evaluations.outcome_probabilities`, tablas `player_absences` y `team_lineups` |

## `AppStore`

`packages/database/src/store/types.ts`. Es la frontera entre la app y la persistencia. Métodos por grupo:

- **Catálogo**: `listSports`, `upsertSport`, `listCompetitions`, `upsertCompetition`, `listTeams`, `getTeam`, `upsertTeam`.
- **Partidos**: `listMatches(filter?: MatchFilter)` (filtra por `status`, `since`, `limit` en SQL parametrizado o en memoria), `getMatch`, `upsertMatch`.
- **Predicciones**: `listPredictions`, `getLatestPrediction`, `savePrediction`.
- **Fuentes y jobs**: `listSources`, `upsertSource`, `listScrapingJobs`, `addScrapingJob`.
- **Entidades**: `listUnresolvedEntities`, `addUnresolvedEntity`, `resolveEntity`, `listEntityAliases`, `upsertEntityAlias`.
- **RAW**: `saveRawRecord`, `listRawRecords`, `deleteRawRecordsOlderThan`.
- **Backtests**: `saveBacktestRun`, `listBacktestRuns`.
- **Evaluaciones**: `savePredictionEvaluation`, `listPredictionEvaluations`.
- **Disponibilidad**: `upsertPlayerAbsences`, `listPlayerAbsences`, `upsertTeamLineups`, `listTeamLineups`.
- **Meta**: `getDataMode`.

Dos implementaciones, y las dos deben estar siempre al día:

- `MemoryStore`: mapas en memoria; `MemoryStore.seeded()` carga `createSeedData()`. Se usa en tests de la API (`analysis.service.spec.ts`) y como fallback.
- `PostgresStore`: `pg.Pool`; `migrate()`, `seedIfEmpty()` (siembra solo si `matches` está vacía). API y worker reutilizan cada uno su propia instancia de `AppStore` para evitar fugas de conexiones en el pool de PostgreSQL.

`MatchFilter` combina sus filtros con AND: `status` exige igualdad, `since` incluye partidos con `scheduledAt >= since` y un `limit` positivo restringe el resultado después de ordenar por fecha ascendente. Sin filtro devuelve todos los partidos. Filtrar en SQL reduce filas transferidas; no garantiza un índice ni elimina por sí solo un escaneo de tabla.

En modo memoria los almacenes de API y worker son independientes: un job no actualiza la memoria de la API. Usa PostgreSQL para compartir datos entre procesos.

## Cómo añadir un campo o una tabla

Ejemplo real: añadir `outcome_probabilities` a `predictions` (migración 003).

1. **Dominio**: añade el campo al tipo (`Prediction.outcomeProbabilities`). El typecheck te mostrará cada sitio que construye el objeto.
2. **Migración**: `007_<nombre>.sql` idempotente. Añádela a la lista `migrationFiles` en `PostgresStore.migrate`.
3. **PostgresStore**: `INSERT`/`UPDATE` con la columna nueva y el `map*` que la lee (`row['outcome_probabilities']`).
4. **MemoryStore**: normalmente no hay que tocarlo (guarda el objeto entero), salvo métodos nuevos.
5. **Seed**: si el tipo es obligatorio, actualiza `seed.ts`.
6. **Consumidores**: `analysis.service.ts`, `pipeline.ts`, web.
7. `npm run typecheck && npm run lint && npm test`. Levanta la API contra Postgres y confirma que `migrate()` no falla.

Para una tabla nueva, además: tipo del registro en `types.ts`, métodos en la interfaz, implementación en ambos stores, export en `packages/database/src/index.ts`.

## Consultas útiles

```bash
docker exec -it prediction-postgres-1 psql -U sports -d sports_prediction
```

```sql
-- partidos por competición y fuente
select c.name, c.active, m.source_id, m.status, count(*)
from matches m join competitions c on c.id = m.competition_id
group by 1,2,3,4 order by 1,3,4;

-- últimas predicciones de un partido
select model_version, generated_at, predicted_home, predicted_away, confidence, outcome_probabilities
from predictions where match_id = 'match-af-1208828' order by generated_at desc;

-- últimos jobs de ingesta
select status, records_processed, records_found, error, started_at
from scraping_jobs order by started_at desc limit 10;

-- comparativa de backtests
select model_version, ran_at, samples, round(winner_rate::numeric,3) winner,
       round(brier_score::numeric,4) brier, round(log_loss::numeric,4) logloss
from backtest_runs order by ran_at desc limit 10;

-- Temporada en vivo: cuántas predicciones reales (antes del partido) llevamos evaluadas
select model_version, generated_before_kickoff, count(*), round(avg(brier_score)::numeric, 3) as brier
from prediction_evaluations where kickoff_at >= '2026-07-01' group by 1, 2;

-- equipos sin resolver
select incoming_name, source_id, created_at from unresolved_entities order by created_at desc;
```

## Reiniciar la base

```bash
docker compose down -v && docker compose up -d
# arranca la API: migra y siembra; luego import-season para 2022, 2023, 2024
```

## Despliegue previsto

PostgreSQL en Neon y Redis en Upstash (ambos con tier gratuito). Las migraciones se aplican solas al arrancar la API, así que no hay paso de despliegue adicional; sí conviene que API y worker no arranquen exactamente a la vez la primera vez (las migraciones son idempotentes pero no están serializadas con un lock). El paso a paso completo está en [09-ci-y-despliegue](./09-ci-y-despliegue.md).
