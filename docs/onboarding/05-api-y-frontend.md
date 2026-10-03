# 5. API y frontend

## API (NestJS)

- Puerto `3000`, sin prefijo global. El frontend llama a `/api/...` y Vite reescribe a `/...`.
- CORS abierto (`origin: true`) en desarrollo.
- Un solo módulo raíz (`app.module.ts`) con 4 controllers y 1 servicio; `StoreModule` es `@Global()` y provee `AppStore` bajo el token `STORE`.
- Sin autenticación de usuarios (fuera del MVP). En despliegue, `/admin/*` se protege con un secreto compartido: si la API tiene `ADMIN_TOKEN`, exige la cabecera `x-admin-token` (`AdminTokenGuard`, 401 si falta). En local la variable va vacía y todo queda abierto. Ver [09-ci-y-despliegue](./09-ci-y-despliegue.md).
- Errores: Nest devuelve `{ statusCode, message, error }`. Los mensajes de usuario están en español. Nunca filtramos trazas internas de scraping al cliente público; el Admin sí recibe el `detail` crudo.

### Endpoints públicos

| Método y ruta | Devuelve | Notas |
|---|---|---|
| `GET /health` | `{ status: 'ok', store: 'postgres' \| 'memory', storeReason }` | liveness + qué store está activo y por qué |
| `GET /meta` | `{ dataMode: 'seed' \| 'live' }` | el dashboard lo usa para el banner |
| `GET /sports` | `Sport[]` | |
| `GET /competitions` | `Competition[]` | **solo `active: true`** (ligas visibles) |
| `GET /teams` | `Team[]` | todos, incluidos los de ligas de soporte |
| `GET /matches/today` | `MatchCard[]` | ver lógica de selección abajo |
| `GET /matches/:id` | `MatchCard` | 404 si no existe |
| `GET /matches/:id/analysis` | `MatchAnalysis` | genera y guarda la predicción si no existe |

#### Lógica de `GET /matches/today`

Función pura `selectDashboardMatches(matches, now)` (`apps/api/src/analysis/selectDashboardMatches.ts`, con spec):

1. Filtra partidos de competiciones *featured* (en el servicio).
2. Si hay partidos reales (cualquier fuente distinta del seed) **hoy** (UTC), devuelve esos.
3. Si no, la **próxima jornada**: desde el día del siguiente kickoff programado, 4 días de ventana, máximo 12 por competición.
4. Si no hay nada programado (solo historial), la **última jornada por competición**: 3 días antes del partido más reciente, máximo 12.
5. Si no hay datos reales, los partidos seed de hoy.

Cada `MatchCard` lleva equipos, competición, forma reciente y la última predicción (o `null`).

#### Lógica de `GET /matches/:id/analysis`

1. Carga partido, equipos y competición (404 si falta algo).
2. `dataCutoffAt = min(ahora, kickoff − 5 min)`.
3. Historial → ratings Dixon-Coles → `FeatureSnapshot`.
4. Si no hay predicción guardada, predice con el modelo por defecto y la **persiste**. Si el motor devuelve error, `prediction: null` y `unavailableReason` con texto en español.
5. Si el partido terminó, calcula `evaluation` (exacto, ganador, Brier, log loss).
6. `comparison`: ataque/defensa (ajustados por rival si hay ratings), forma reciente, localía.

Nota: la respuesta incluye `prediction.outcomeProbabilities`. La página pública no las renderiza (PRD: 1X2 es V2); si se quiere cumplir también a nivel de API, habría que omitirlas en un DTO público.

### Endpoints de administración

| Método y ruta | Body / query | Qué hace |
|---|---|---|
| `GET /admin/health` | | contadores: fuentes, sanas, jobs, entidades pendientes, predicciones, `dataMode` |
| `GET /admin/meta` | | `{ dataMode }` |
| `GET /admin/sources` | | `DataSourceRecord[]` |
| `POST /admin/sources` | `{ id?, name, kind, active? }` | crea fuente |
| `PATCH /admin/sources/:id` | `{ active?, health? }` | |
| `POST /admin/sources/:id/test` | | prueba real: seed cuenta partidos; API-Football y football-data.org hacen `ping()` (`PINGABLE_PROVIDERS`). Registra un `scraping_job` y actualiza `health`. Devuelve `{ source, detail }` con `detail` como `api-football-ok:12`, `skipped:missing-api-football-key`, `api-football-failed:<msg>` |
| `GET /admin/scraping/jobs` | | historial de ejecuciones |
| `POST /admin/jobs` | `{ name, season?, chain? }` | encola en BullMQ; `chain: true` con `scrape-source` encadena generar + evaluar. 400 si el nombre no es un `JobName` o la temporada es inválida; 400 si Redis no responde |
| `GET /admin/schedules` | | schedules declarados en `JOB_SCHEDULES` con `cron`, `nextRunAt` y `registered` (si el worker ya los registró en Redis). 400 si Redis no responde |
| `GET /admin/entities/unresolved` | | equipos creados por ingest sin alias previo (con `provisionalTeamId`) |
| `GET /admin/teams` | | para los selectores de resolución y fusión |
| `POST /admin/entities/match` | `{ unresolvedId, teamId, alias }` | fusiona el equipo provisional en `teamId` (si lo hay), crea alias, marca resuelto. Devuelve `{ team, mergedTeamId, movedMatches }` |
| `POST /admin/teams/merge` | `{ sourceTeamId, targetTeamId }` | mueve partidos y aliases de origen a destino y borra el origen. 400 si son iguales, 404 si alguno no existe |
| `GET /admin/predictions` | | todas las predicciones (con `outcomeProbabilities`) |
| `POST /admin/predictions/generate` | | predice todos los `scheduled` sin predicción |
| `POST /admin/predictions/regenerate` | `{ force?: boolean }` | re-predice partidos *featured* cuya última predicción no sea del modelo actual; con `force`, todos. Las predicciones viejas se conservan |
| `GET /admin/models` | | `{ default, available }` |
| `GET /admin/backtests` | `?limit=20` | corridas persistidas, más reciente primero (máx. 100). Solo lectura |
| `POST /admin/backtests` | `{ model? }` | **ejecuta** un backtest walk-forward (modelo por defecto si no se indica) y lo persiste; devuelve `BacktestRunRecord`. 400 si el modelo no existe |
| `GET /admin/evaluations/summary` | `?model=&since=&liveOnly=` | métricas de la **temporada en vivo** a partir de `prediction_evaluations` (sin re-ejecutar el modelo). Por defecto: modelo actual, desde el 1 de julio de la temporada en curso, solo predicciones generadas antes del partido (`liveOnly=false` incluye las rellenadas a posteriori; `backfilled` dice cuántas se excluyeron). Mismas tablas que el backtest (`summarizeBacktest`), solo competiciones visibles |
| `POST /admin/sports` | `{ name, slug }` | |
| `POST /admin/competitions` | `{ name, sportId, country? }` | |

### Ejemplos con `curl`

```bash
curl -s localhost:3000/matches/today | jq '.[0].match'
curl -s localhost:3000/matches/match-af-1208828/analysis | jq '.prediction'
curl -s -X POST localhost:3000/admin/jobs -H 'Content-Type: application/json' \
     -d '{"name":"import-season","season":2023}'
curl -s -X POST localhost:3000/admin/backtests -H 'Content-Type: application/json' \
     -d '{"model":"football-v2"}' | jq '{samples, winnerRate, brierScore}'
curl -s "localhost:3000/admin/backtests?limit=5" | jq '.[] | {modelVersion, brierScore}'
curl -s "localhost:3000/admin/evaluations/summary" | jq '{samples, winnerRate, brierScore, backfilled}'
curl -s localhost:3000/admin/schedules | jq '.[] | {id, cron, nextRunAt}'
curl -s -X POST localhost:3000/admin/predictions/regenerate -H 'Content-Type: application/json' -d '{"force":true}'
```

### `AnalysisService`

Es el único servicio con lógica de negocio en la API. Métodos públicos:

- `listTodayCards()`, `getMatchCard(id)`, `getAnalysis(id)`
- `generateAllPredictions()`, `regenerateOutdatedPredictions({ force })`
- `runBacktest(modelVersion)`, `listBacktestRuns(limit)`, `listModels()`

Privados: `toCard`, `loadHistory` (→ `buildFinishedHistory`), `buildComparison`. La clase `RatingsCache` (mismo archivo) evita reajustar Dixon-Coles por cada partido en backtests y regeneraciones.

Si la lógica crece, el siguiente paso natural es separar un `BacktestService` y un `PredictionService`; hoy no era necesario.

## Frontend (React + Vite)

### Estructura

```text
apps/web/src/
  main.tsx                 QueryClientProvider + BrowserRouter
  app/App.tsx              layout, header contextual, rutas
  features/
    today/TodayDashboard.tsx        /            cards, filtros, banner seed/live
    analysis/MatchAnalysisPage.tsx  /matches/:id marcador, xG, factores, comparación, evaluación
    admin/AdminPage.tsx             /admin       fuentes, jobs, entidades, predicciones
    admin/BacktestPanel.tsx                      selector de modelo, métricas, líneas base, calibración
  shared/
    api.ts                 cliente HTTP tipado (único punto de acceso a la API)
    format.ts              fechas/horas en español
  styles/                  variables CSS globales
```

Reglas:

- **CSS Modules nativos**, nombres BEM-ish. Sin Tailwind, Sass ni kits de UI (ADR 0001).
- **TanStack Query** para todo dato de servidor. Claves: `['matches','today']`, `['matches', id, 'analysis']`, `['meta']`, `['teams']`, `['admin', ...]`. Tras una mutación en Admin invalidamos `['admin']` y, si afecta a predicciones, `['matches']`.
- Tipos de dominio importados directamente de `@sports-prediction/domain`; los DTOs que no existen en dominio (fuentes, jobs, backtests) están en `shared/api.ts`.
- Textos en español. Si añades uno, piensa en que mañana habrá i18n: no concatenes frases con lógica.
- Sin `any`. `strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`: `array[0]` es `T | undefined`.

### Qué muestra cada pantalla

**Partidos de hoy (`/`)**
Banner según `dataMode`. Filtros por competición y estado. Una card por partido con equipos, forma (`W D L`), hora (y fecha si no es hoy), marcador estimado y confianza si hay predicción, botón "Analizar".

**Análisis (`/matches/:id`)**
Marcador estimado, goles esperados (gráfico Recharts), confianza, lista de factores con dirección e impacto, comparación de equipos (ataque/defensa ajustados, forma, localía) y, si el partido terminó, resultado real y evaluación. Si no hay predicción, muestra `unavailableReason`. **No** muestra 1X2.

**Admin (`/admin`)**
Contadores, acciones (generar, regenerar, regenerar forzado), botones de jobs (con input de temporada para `import-season`), sección "Programación" (schedules y próxima ejecución), `LiveEvaluationPanel`, `BacktestPanel`, fuentes con "Probar" y último `detail`, entidades sin resolver con selector de equipo canónico y formulario de fusión, jobs recientes con estado y error, últimas predicciones con `1X2 a/b/c` (solo aquí se ven las probabilidades).

### `LiveEvaluationPanel` y `BacktestPanel`

Son dos respuestas a preguntas distintas y conviene no mezclarlas:

- **Temporada en vivo** (`LiveEvaluationPanel`, `GET /admin/evaluations/summary`): ¿cómo le fue a lo que de verdad publicamos? Solo cuenta predicciones guardadas antes del partido y evaluadas al conocer el resultado. Es la métrica honesta de cara al producto; empieza vacía cada temporada y crece jornada a jornada. El checkbox "incluir predicciones generadas tras el partido" añade las rellenadas a posteriori (sirven para depurar, no para presumir).
- **Backtest** (`BacktestPanel`, `POST /admin/backtests`): ¿qué tan bueno es el modelo sobre el historial? Re-ejecuta el modelo partido a partido con corte temporal. Es la herramienta para comparar versiones antes de cambiar el modelo por defecto.

Ambos comparten `MetricsTables` (líneas base, por competición, calibración) y la misma función de resumen (`summarizeBacktest`), así que los números son comparables entre sí.

### Añadir una pantalla

1. Carpeta en `features/<nombre>/` con `Componente.tsx`, `Componente.module.css`, `Componente.spec.ts(x)`.
2. Ruta en `app/App.tsx` y, si procede, copy del header en `HeaderCopy`.
3. Funciones nuevas en `shared/api.ts` con tipos explícitos.
4. `npm run typecheck && npm run lint && npm test && npm run build --workspace=@sports-prediction/web`.
