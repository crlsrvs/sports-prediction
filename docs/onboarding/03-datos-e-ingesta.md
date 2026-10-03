# 3. Datos e ingesta

## Fuentes

Hay dos `data_sources` sembradas:

| id | Tipo | Estado | Qué aporta |
|---|---|---|---|
| `source-seed` | demo | siempre presente | 8 equipos, 26 resultados ficticios (septiembre 2026) y 3 partidos programados. Sirve para que la UI funcione sin red. |
| `source-api-football` | API | `disabled` hasta configurar `API_FOOTBALL_KEY` | Fixtures reales de 6 ligas, temporadas 2022–2024. |

El patrón para cualquier fuente es **Fetcher → Parser → Ingest**:

1. *Fetcher*: hace la petición y devuelve un `RawScrape` (url, status, payload, checksum, metadata). No interpreta nada.
2. *Parser*: convierte el payload en tipos del proveedor (`ApiFootballFixtureItem`).
3. *Ingest/Normalizer*: traduce tipos del proveedor a `Team`/`Match` del dominio, resolviendo identidades.

Solo el paso 3 toca el dominio; los dos primeros son 100 % específicos del proveedor.

## API-Football en detalle

Archivo: `packages/scraping/src/apiFootball.ts`.

- Base URL `https://v3.football.api-sports.io`, cabecera `x-apisports-key`.
- `fetchSeasonFixtures({ leagueId, season })`: `GET /fixtures?league=X&season=Y`. Una request devuelve la temporada completa de una liga (~380 partidos).
- `fetchMvpSeason(season)`: itera `TRACKED_LEAGUE_IDS` (las 6 ligas) y acumula fixtures y warnings por liga sin abortar el conjunto.
- `fetchTodaysFixtures({ date })`: `GET /fixtures?date=YYYY-MM-DD` filtrado a `MVP_LEAGUE_IDS`. Es lo que usa `scrape-source`.
- `ping()`: consulta la fecha de hoy; se usa en Admin → Probar.
- `resolveApiFootballSeason(now, env)`: `API_FOOTBALL_SEASON` si está definida; si no, `min(temporada actual, 2024)`.

Ids de liga: UCL 2, Premier 39, La Liga 140, Bundesliga 78, Serie A 135, Ligue 1 61.

### Limitaciones del plan gratuito

Descubiertas empíricamente y codificadas en el adapter:

- Solo temporadas **2022, 2023 y 2024** (`API_FOOTBALL_FREE_MAX_SEASON`).
- No admite `last=` ni `next=`.
- `?date=` solo funciona en una ventana de ~±1 día alrededor de hoy y **sin** `season`.
- 10 requests/minuto, 100/día. Un `import-season` consume 6 requests.

Consecuencia de producto: no tenemos la temporada en curso. El dashboard muestra la jornada más reciente disponible de cada liga visible (ventana de 3 días, máximo 12 partidos por competición) cuando no hay partidos reales en la fecha actual.

## Catálogo de competiciones

```ts
// packages/scraping/src/apiFootball.ts
API_FOOTBALL_COMPETITIONS = [
  { leagueId: 2,   competitionId: 'comp-ucl',        role: 'featured' },
  { leagueId: 39,  competitionId: 'comp-pl',         role: 'featured' },
  { leagueId: 140, competitionId: 'comp-laliga',     role: 'featured' },
  { leagueId: 78,  competitionId: 'comp-bundesliga', role: 'support'  },
  { leagueId: 135, competitionId: 'comp-seriea',     role: 'support'  },
  { leagueId: 61,  competitionId: 'comp-ligue1',     role: 'support'  },
]
```

`trackedCompetitions()` produce las entidades `Competition` (support → `active: false`). `import-season` las crea si no existen, sin pisar las que ya haya (un admin puede activar/desactivar manualmente).

Para añadir una liga: una línea en este array y un `import-season`. Nada más.

## Ingest: de fixture a dominio

Archivo: `packages/scraping/src/ingestFixtures.ts`, función `ingestApiFootballFixtures({ fixtures, teams, competitions, now })`.

Por cada fixture:

1. Busca la competición por `league.id` en `LEAGUE_TO_COMPETITION`. Si no está mapeada → `failed`.
2. Resuelve cada equipo con `resolveTeam`:
   - Intenta `matchTeamByAlias(nombre, equipos)` (exacto o texto normalizado). Si acierta, añade el nombre a los `aliases` del equipo canónico.
   - Si no, crea un equipo nuevo con id `team-af-<providerId>`, aliases `[nombre, 'api-football:<id>']`, y lo apunta en `unresolvedNames` para que un admin lo revise (podría ser un duplicado con otro nombre).
3. Mapea el estado (`FT`/`AET`/`PEN` → `finished`, `NS`/`TBD` → `scheduled`, `PST`/`SUSP` → `postponed`, `CANC`/`ABD`/`AWD`/`WO` → `cancelled`, cualquier otro → `live`) y los goles.
4. Crea el `Match` con id `match-af-<fixtureId>` y `sourceId = source-api-football`.

Devuelve `{ teamsToUpsert, matches, unresolvedNames, processed, failed }`. El worker persiste todo con `upsert`, así que re-importar una temporada es idempotente y actualiza marcadores.

### Entidades sin resolver y aliases

Cuando el ingest crea un equipo nuevo, aparece en Admin → "Entidades sin resolver". Si realmente es un equipo que ya existía con otro nombre (p. ej. `Man City FC` vs `Manchester City`), el admin elige el canónico y pulsa **Resolver**: el alias se añade a `teams.aliases` del canónico y la entidad pendiente se elimina. La próxima importación mapeará ese nombre al equipo correcto.

Ojo: resolver **no** fusiona los partidos ya importados bajo el id duplicado (`team-af-<id>`). Si eso ocurre con un equipo relevante, hay que reasignar `home_team_id`/`away_team_id` manualmente y borrar el duplicado. Es una mejora pendiente.

Hoy el matcher es deliberadamente conservador (exacto/normalizado). No hace fuzzy matching para evitar falsos positivos; preferimos un alias manual a un equipo mal fusionado.

## RAW: retención y propósito

Cada respuesta HTTP se guarda íntegra en `raw_records` (payload, checksum SHA-256, metadata como `season`). Sirve para depurar un ingest sin volver a pedir a la API y para reprocesar si cambia el parser.

**No es el almacén a largo plazo.** El job `cleanup-raw-data` borra registros con más de `MAX_RAW_RETENTION_DAYS` (30) días.

## Jobs

Nombres en `packages/shared/src/jobs.ts`; implementación en `apps/worker/src/pipeline.ts`.

| Job | Qué hace | Estado real |
|---|---|---|
| `discover-todays-matches` | Cuenta partidos con fecha de hoy | informativo |
| `scrape-source` | Pide los fixtures de hoy, guarda RAW, ingiere, actualiza salud de la fuente | funcional; en plan gratuito casi siempre devuelve 0 fixtures MVP |
| `import-season` | Descarga una temporada completa de las 6 ligas (`data.season` o `API_FOOTBALL_SEASON`), crea competiciones faltantes, guarda RAW, ingiere | **la vía principal de datos reales** |
| `normalize-source-data` | — | `skipped`: la normalización ocurre inline durante el ingest |
| `calculate-features` | — | `skipped`: las features se calculan bajo demanda |
| `generate-predictions` | Para cada partido `scheduled` sin predicción: ajusta ratings, construye snapshot, predice con el modelo por defecto y guarda | funcional |
| `evaluate-predictions` | Evalúa la última predicción de cada partido terminado | funcional (no persiste aún; el backtest cubre la necesidad) |
| `cleanup-raw-data` | Borra RAW > 30 días | funcional |
| `source-health-check` | Cuenta fuentes | informativo |

Cada ejecución de scrape/import deja una fila en `scraping_jobs` con `status` (`success`, `partial`, `failed`, `skipped`), conteos y `error`. Es la primera pantalla a mirar cuando "no pasa nada". Regla: **nunca marcamos `success` si no se procesó nada**; eso sería mentirle al admin.

### Cómo se encola un job

```http
POST /admin/jobs
{ "name": "import-season", "season": 2023 }
```

`AdminController.enqueue` valida el nombre con `isJobName`, valida `season` si viene, y llama a `enqueueJob(name, data)` (`apps/api/src/jobs/jobQueue.ts`), que usa un `Queue` de BullMQ. El worker recibe `job.name` y `job.data` y llama a `runPipelineJob`.

No hay scheduler automático todavía (cron). Los jobs se disparan desde Admin o por HTTP.

## Datos actuales en la base local (referencia)

Tras importar 2022–2024 de las 6 ligas:

- ~6 050 partidos reales terminados, 234 equipos.
- Por competición visible: Premier 1 140, La Liga 1 140, UCL 707.
- Soporte: Serie A 1 141, Ligue 1 996, Bundesliga 924.

Si tu base tiene menos, ejecuta los `import-season` que falten.

## Qué fuente sigue

Para tener la temporada en curso, el candidato es football-data.org (tier gratuito con 2025/26 para las mismas 6 ligas, 10 req/min). Implementarlo es: nuevo adapter en `packages/scraping` (Fetcher/Parser), reutilizar `ingestApiFootballFixtures` adaptando el tipo de entrada (o un `ingestFootballDataFixtures` paralelo), nuevo `sourceId`, y que `getDataMode()` lo cuente como `live`. El dominio y el motor no cambian.
