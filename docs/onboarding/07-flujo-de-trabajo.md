# 7. Flujo de trabajo

## Git

- **GitHub Flow**: rama desde `main` → PR → merge. `main` siempre debe pasar typecheck, lint y tests.
- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. Con ámbito cuando ayuda: `feat(prediction): ...`, `fix(scraping): ...`.
- Sin atribución a herramientas de IA ni `Co-Authored-By` en los commits.
- **CHANGELOG.md** (Keep a Changelog) se actualiza en el mismo commit que el cambio, bajo `[Unreleased]` → `Added` / `Changed` / `Fixed`.
- Versionado SemVer. Hoy todo es `0.1.0`.

Ejemplo de mensaje:

```text
feat(prediction): football-v3 Dixon-Coles ratings engine

- Add fitDixonColes in features: opponent-adjusted, time-decayed ratings
- Add FeatureSnapshot.ratings and shared dixonColesTau
- Cache fits per cutoff in backtests
```

## Definición de hecho

Nada se considera terminado (ni se pide revisión) sin que **los tres** terminen con código 0:

```bash
npm run typecheck
npm run lint
npm test
```

Si tocaste el frontend, además `npm run build --workspace=@sports-prediction/web`. Si tocaste persistencia, levanta la API contra Postgres y comprueba que migra. Si tocaste el modelo, corre un backtest y compara con el anterior.

Si algo falla, se arregla la causa raíz, no se silencia (`// eslint-disable`, `as any`, `@ts-expect-error` sin justificación escrita no pasan revisión).

## TypeScript

`tsconfig.base.json` activa `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules` y módulos `NodeNext`. Consecuencias prácticas:

- `array[i]` es `T | undefined`: usa `?? valor`, o `.at()`, o comprueba.
- No pases `undefined` a una propiedad opcional: `cond ? { a, b } : { a }`.
- Imports de tipos con `import type` o `type X` inline.
- ESM puro: las rutas relativas llevan `.js` (`'./poisson.js'`) aunque el archivo sea `.ts`.
- Prohibido `any`. Si de verdad no conoces la forma, `unknown` y estrecha.
- Los ids del dominio son *branded*: `asTeamId('x')`, no `'x' as TeamId`.

## Tests

- Vitest, archivos `*.spec.ts(x)` **al lado** de la implementación.
- Patrón **Arrange–Act–Assert** con los tres comentarios explícitos. Es una convención del repo, no una sugerencia.
- Tests unitarios puros para `domain`, `features`, `prediction`, `normalization`, `scraping` (con `fetch` mockeado tipado: `vi.fn<(input, init?) => Promise<Response>>()`).
- Para la API, `MemoryStore.seeded()` como store: sin Postgres, sin red.
- No testeamos NestJS en sí ni React con DOM todavía; los tests de `web` cubren lógica pura (filtros, formateo).
- Un test de modelo debe comprobar **propiedades** (probabilidades suman 1, marcador coherente con el favorito, rechazo de fuga temporal), no valores mágicos frágiles.

```bash
npm test                                         # todo
npx vitest run packages/features                 # un paquete
npx vitest run packages/prediction/src/footballV3.spec.ts
npx vitest                                       # watch
```

## Convenciones de nombres

| Qué | Convención | Ejemplo |
|---|---|---|
| variables, funciones, hooks | camelCase | `buildFeatureSnapshot`, `useMatchAnalysis` |
| componentes, clases, tipos | PascalCase | `BacktestPanel`, `AppStore`, `MatchRatings` |
| columnas DB, claves de APIs externas | snake_case | `data_cutoff_at`, `x-apisports-key` |
| constantes globales, env vars | SCREAMING_SNAKE_CASE | `DEFAULT_MODEL_VERSION`, `API_FOOTBALL_KEY` |
| archivos de test | `.spec.ts` / `.spec.tsx` | `dixonColes.spec.ts` |
| CSS Modules | `Componente.module.css`, clases camelCase | `styles.resolveRow` |

Documentación en código: TSDoc **solo** para intención de negocio, lógica no obvia o efectos secundarios. No repitas lo que ya dice el tipo.

## Dónde va cada cosa

| Quiero… | Toco… |
|---|---|
| Una regla de negocio sobre qué es un partido/predicción | `packages/domain` |
| Una feature nueva para el modelo | `packages/features` (+ campo en `FeatureSnapshot`) |
| Un modelo nuevo o cambiar uno | `packages/prediction` |
| Una fuente de datos nueva | `packages/scraping` (adapter + ingest) |
| Persistir algo nuevo | `packages/database` (tipo, interfaz, ambos stores, migración) |
| Un endpoint | `apps/api/src/<feature>/` (controller) y lógica en un service |
| Un job | `packages/shared/src/jobs.ts` + `case` en `apps/worker/src/pipeline.ts` + botón en Admin si debe ser manual |
| Una pantalla o widget | `apps/web/src/features/<feature>/` |
| Un texto que ve el usuario | donde se renderiza; en español; sin lógica concatenada |
| Una decisión de arquitectura | `docs/adr/NNNN-titulo.md` antes del código |

## Recetas

### Añadir una liga

1. Línea en `TRACKED_COMPETITIONS` (`packages/scraping/src/competitions.ts`) con `role: 'featured' | 'support'`, `apiFootballLeagueId` y `footballDataCode`.
2. Encolar `import-season` para cada temporada histórica y `scrape-source` para la actual.
3. Si es `featured`, verificar que el dashboard la muestra y correr backtest para ver su Brier.

### Añadir un job

1. Nombre en `JOB_NAMES` (`packages/shared/src/jobs.ts`); el test `jobs.spec.ts` valida la forma.
2. `case` en `runPipelineJob`. El `default: never` te obliga.
3. Si recibe parámetros, léelos de `data` y valídalos (ver `parseSeason`).
4. Registrar siempre un `scraping_job` con estado honesto cuando haya I/O externo.
5. Botón en `ENQUEUEABLE_JOBS` (`AdminPage.tsx`) si debe dispararse a mano.

### Añadir un factor explicativo

En el motor correspondiente, dentro de `buildFactors`: `{ feature, value, impact, direction, explanation }`. `impact` en [0, 1] se usa para ordenar; `explanation` en español, plantilla determinista. Añade un caso al spec del motor que compruebe que aparece cuando debe.

### Cambiar un hiperparámetro del modelo

No lo cambies "porque parece razonable". Haz un barrido (abajo), compara Brier/log loss **y** calibración, documenta el resultado en el TSDoc de la constante y en el CHANGELOG.

### Experimentos con el modelo

Los scripts de exploración **no se commitean**. Patrón que usamos:

```bash
# escribe el script fuera del repo
cat > /tmp/sweep.ts <<'EOF'
import { createAppStore } from '@sports-prediction/database';
import { buildFeatureSnapshot, buildFinishedHistory, fitDixonColes } from '@sports-prediction/features';
import { evaluatePrediction, predictV3 } from '@sports-prediction/prediction';
// ... itera history, ajusta con options distintas, acumula Brier ...
process.exit(0);
EOF
# ejecútalo dentro de apps/api para heredar sus dependencias y .env
cd apps/api && cp /tmp/sweep.ts ./.sweep.tmp.ts && npx tsx --env-file=../../.env ./.sweep.tmp.ts; rm -f ./.sweep.tmp.ts
```

Reglas del experimento: mismo conjunto de partidos objetivo, corte `kickoff − 1 h`, un ajuste por corte distinto, y reportar al menos Brier, log loss y acierto de ganador. Si el resultado es bueno, los defaults cambian en código con su justificación.

### Depurar "la predicción no aparece"

1. `GET /matches/:id/analysis` → ¿`unavailableReason`? Si es "Faltan datos obligatorios", algún equipo no tiene forma (sin partidos previos al corte). Si es "No hay suficiente historial para calcular los ratings", el snapshot llegó sin `ratings` (bug de cableado).
2. ¿El partido es de una competición `active`? Las de soporte no se regeneran.
3. ¿`App store mode: memory`? Entonces estás viendo seed, no tu base.

### Depurar "el import no trae nada"

1. Admin → Jobs recientes: `status` y `error`.
2. `skipped:missing-api-football-key` → `.env` + reiniciar worker.
3. `partial` con warning por liga → esa liga falló (límite de requests, temporada no permitida). Reintenta en un minuto.
4. `failed` con mensaje HTTP → revisa la clave y la cuota diaria (100/día).

## Trabajar con agentes de IA

`AGENTS.md` es la única fuente de reglas para agentes (sin archivos propietarios tipo `CLAUDE.md` o `.cursor/rules`). Si un agente propone algo que contradice `AGENTS.md`, el PRD o un ADR, gana el documento. Lo que un agente entregue pasa por la misma definición de hecho que lo que entrega una persona.

El directorio `.codegraph/` contiene un índice local de código para herramientas; está ignorado por git salvo su propio `.gitignore`.

## Revisión de PR: qué miramos

- Respeta las fronteras entre paquetes (ningún import "hacia arriba").
- Nada de datos inventados: si falta información, `null`/`unavailable`, nunca un valor por defecto que parezca real.
- Corte temporal respetado en cualquier cálculo nuevo.
- Estados de jobs honestos.
- Tests AAA junto al código, propiedades y no valores mágicos.
- Textos de usuario en español.
- CHANGELOG actualizado.
- Si cambia el modelo: tabla antes/después del backtest en la descripción del PR.
