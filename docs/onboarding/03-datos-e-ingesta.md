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

Consecuencia: API-Football es nuestra fuente de **historial** (2022–2024). La temporada en curso viene de football-data.org.

## football-data.org en detalle

Archivo: `packages/scraping/src/footballData.ts`. Es la fuente de la **temporada en curso** (fixtures programados + resultados).

- Base URL `https://api.football-data.org/v4`, cabecera `X-Auth-Token` (`FOOTBALL_DATA_KEY`).
- `fetchCompetitionMatches({ code, season? })`: `GET /competitions/{code}/matches`. Sin `season` devuelve la temporada en curso completa (~380 partidos en una liga).
- `fetchTrackedCompetitions(season?)`: itera las 6 competiciones del catálogo acumulando warnings por competición (un 429 en una liga no tira las demás).
- `ping()`: pide la PL en curso; se usa en Admin → Probar.
- Tier gratuito: 10 req/min, ligas "tier one" (incluye nuestras 6). Un `scrape-source` consume 6 requests; no lo encadenes dos veces en el mismo minuto.
- Estados: `FINISHED` → `finished`; `SCHEDULED`/`TIMED` → `scheduled`; `IN_PLAY`/`PAUSED` → `live`; `POSTPONED`/`SUSPENDED` → `postponed`; `CANCELLED`/`AWARDED` → `cancelled`.

Los equipos vienen con `name`, `shortName` y `tla`. El ingest usa `[name, shortName]` como candidatos para casar con los equipos existentes (API-Football usa nombres cortos: `Arsenal` vs `Arsenal FC`).

## Catálogo de competiciones

```ts
// packages/scraping/src/competitions.ts
TRACKED_COMPETITIONS = [
  { competitionId: 'comp-ucl',        role: 'featured', apiFootballLeagueId: 2,   footballDataCode: 'CL'  },
  { competitionId: 'comp-pl',         role: 'featured', apiFootballLeagueId: 39,  footballDataCode: 'PL'  },
  { competitionId: 'comp-laliga',     role: 'featured', apiFootballLeagueId: 140, footballDataCode: 'PD'  },
  { competitionId: 'comp-bundesliga', role: 'support',  apiFootballLeagueId: 78,  footballDataCode: 'BL1' },
  { competitionId: 'comp-seriea',     role: 'support',  apiFootballLeagueId: 135, footballDataCode: 'SA'  },
  { competitionId: 'comp-ligue1',     role: 'support',  apiFootballLeagueId: 61,  footballDataCode: 'FL1' },
]
```

Un solo catálogo con una columna por proveedor. `trackedCompetitions()` produce las entidades `Competition` (support → `active: false`); `import-season` y `scrape-source` las crean si no existen, sin pisar las que ya haya (un admin puede activar/desactivar manualmente).

Para añadir una liga: una línea en este array con los ids de ambos proveedores. Nada más.

## Ingest: de fixture a dominio

Archivo: `packages/scraping/src/ingestFixtures.ts`. Es **agnóstico de proveedor**: cada adapter se traduce primero a `NormalizedFixture` (`normalizeApiFootballFixture`, `normalizeFootballDataMatch`) y luego `ingestFixtures({ fixtures, teams, competitions, existingMatches, now })` hace el trabajo. `ingestApiFootballFixtures` e `ingestFootballDataMatches` son envoltorios finos.

```ts
interface NormalizedFixture {
  provider: 'api-football' | 'football-data';
  providerMatchId: number;
  competitionId: string | null;      // ya resuelto contra el catálogo
  kickoffAt: Date; status: MatchStatus;
  homeScore: number | null; awayScore: number | null;
  home: { providerTeamId: number; names: string[] };  // nombre completo primero
  away: { providerTeamId: number; names: string[] };
}
```

Por cada fixture:

1. Si `competitionId` es `null` o no existe en la base → `failed`.
2. Resuelve cada equipo con `resolveTeam`:
   - Primero busca un equipo que ya tenga el alias `<provider>:<id>` (`api-football:50`, `football-data:65`): identidad estable aunque el proveedor cambie el nombre.
   - Si no, prueba cada nombre candidato con `matchTeamByAlias`. Si acierta, añade el nombre y el alias de proveedor al equipo canónico.
   - Si no, crea un equipo nuevo con id `team-af-<id>` / `team-fd-<id>`, aliases `[nombres..., '<provider>:<id>']`, y lo apunta en `unresolvedTeams` (`{ name, teamId }`) para que un admin lo revise.
3. **Dedupe entre proveedores**: si ya existe un partido con la misma competición, los mismos dos equipos y el mismo día UTC (`existingMatches`), reutiliza su id y `sourceId` y solo actualiza estado y marcador. Así una temporada vista por los dos proveedores no se duplica. Se cuenta en `deduplicated`.
4. Crea/actualiza el `Match` con id `match-af-<fixtureId>` / `match-fd-<id>` y el `sourceId` del proveedor.

Devuelve `{ teamsToUpsert, matches, unresolvedTeams, processed, failed, deduplicated }`. El worker persiste todo con `upsert`, así que re-sincronizar es idempotente y actualiza marcadores.

### Entidades sin resolver y aliases

Cuando el ingest crea un equipo nuevo, aparece en Admin → "Entidades sin resolver". Si realmente es un equipo que ya existía con otro nombre (p. ej. `Man City FC` vs `Manchester City`), el admin elige el canónico y pulsa **Resolver**. La entidad pendiente guarda `provisional_team_id` (el `team-af-<id>` que creó el ingest), así que resolver hace dos cosas:

1. **Fusiona** el equipo provisional en el canónico (`store.mergeTeams`): re-apunta `home_team_id`/`away_team_id` de todos sus partidos, mueve `entity_aliases`, combina `aliases` (incluido `api-football:<id>`) y borra el provisional. En Postgres es una transacción.
2. Añade el alias al canónico y borra la fila pendiente. La próxima importación mapeará ese nombre (y ese id de proveedor) al equipo correcto.

La respuesta incluye `mergedTeamId` y `movedMatches`. Las predicciones ya generadas para esos partidos siguen siendo válidas como registro, pero se calcularon con el historial partido en dos; usa **Regenerar todas (forzar)** en Admin para recalcularlas con el historial unificado.

Para duplicados que no pasaron por la cola (p. ej. dos `team-af-*` del mismo club), Admin tiene **Fusionar equipos duplicados** (`POST /admin/teams/merge`). Es irreversible: elige bien cuál es origen (se borra) y cuál destino (se conserva).

El matcher (`packages/normalization/src/entityMatcher.ts`) es deliberadamente conservador, en tres pasadas:

1. alias exacto;
2. texto normalizado (minúsculas, sin acentos, `ø`→`o`, sin puntuación);
3. nombre de club sin formas legales ni años (`normalizeClubName`: quita `FC`, `AFC`, `SV`, `TSG`, `04`, `1899`…), y **solo si un único equipo** cumple. `Bayer 04 Leverkusen` ≡ `Bayer Leverkusen`; `Manchester FC` no casa con nada porque United y City empatan.

No hace fuzzy matching: `Brighton` vs `Brighton & Hove Albion FC` o `PSV` vs `PSV Eindhoven` quedan pendientes a propósito. Preferimos una fusión manual a un equipo mal casado. Con la primera sincronización de 2026/27 quedaron 23 pendientes: 8 eran variantes de este tipo (resueltas desde Admin) y 15 clubes recién ascendidos que no existían en 2022–24.

## RAW: retención y propósito

Cada respuesta HTTP se guarda íntegra en `raw_records` (payload, checksum SHA-256, metadata como `season`). Sirve para depurar un ingest sin volver a pedir a la API y para reprocesar si cambia el parser.

**No es el almacén a largo plazo.** El job `cleanup-raw-data` borra registros con más de `MAX_RAW_RETENTION_DAYS` (30) días.

## Jobs

Nombres en `packages/shared/src/jobs.ts`; implementación en `apps/worker/src/pipeline.ts`.

| Job | Qué hace | Estado real |
|---|---|---|
| `discover-todays-matches` | Cuenta partidos con fecha de hoy | informativo |
| `scrape-source` | Ejecuta cada proveedor configurado. **football-data.org**: sincroniza la temporada en curso de las 6 competiciones (programados + resultados), guarda RAW, ingiere con dedupe, encola equipos nuevos como pendientes. **API-Football**: fixtures de hoy (en plan gratuito casi siempre 0). Cada proveedor registra su propio `scraping_job` | **la vía de la temporada en curso** |
| `import-season` | Descarga una temporada completa de las 6 ligas desde API-Football (`data.season` o `API_FOOTBALL_SEASON`), crea competiciones faltantes, guarda RAW, ingiere. No encola pendientes (crearía cientos de equipos legítimos) | **la vía del historial 2022–2024** |
| `normalize-source-data` | — | `skipped`: la normalización ocurre inline durante el ingest |
| `calculate-features` | — | `skipped`: las features se calculan bajo demanda |
| `generate-predictions` | Para cada partido `scheduled` sin predicción **que empiece en los próximos `PREDICTION_HORIZON_DAYS` (10) días**: construye snapshot, predice con el modelo por defecto y guarda. Los ratings se ajustan una sola vez (todos comparten cutoff = ahora) | funcional |
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

Tras importar 2022–2024 de las 6 ligas (API-Football) y sincronizar 2026/27 (football-data.org):

- ~6 050 partidos históricos terminados + ~1 900 de la temporada en curso (≈270 jugados al inicio de octubre), 248 equipos.
- Por competición visible (historial): Premier 1 140, La Liga 1 140, UCL 707.
- Soporte: Serie A 1 141, Ligue 1 996, Bundesliga 924.

Si tu base tiene menos, ejecuta los `import-season` que falten y un `scrape-source`.

## Añadir otra fuente

Receta probada con football-data.org: adapter en `packages/scraping` (Fetcher/Parser con `ping()`), función `normalizeXxx` → `NormalizedFixture`, columna nueva en `TRACKED_COMPETITIONS`, `sourceId` nuevo en `shared`, fila en el seed de `data_sources`, entrada en `PINGABLE_PROVIDERS` del controller admin y una rama en `scrapeSources` del worker. El dominio, las features y el motor no cambian; `isLiveSourceId` ya cuenta cualquier fuente distinta del seed como dato real.
