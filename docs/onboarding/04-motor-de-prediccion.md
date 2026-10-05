# 4. Motor de predicción

Este es el documento más largo porque es donde está el valor del producto. No hace falta ser estadístico para trabajar aquí, pero sí entender qué calcula cada pieza y por qué.

## El contrato

Todo motor es una función pura:

```ts
type PredictFn = (
  matchContext: MatchContext,
  featureSnapshot: FeatureSnapshot,
) => Result<PredictionOutput, PredictionUnavailableReason>;

type PredictionUnavailableReason =
  | 'missing_minimum_data'   // faltan datos obligatorios (forma, promedios...)
  | 'missing_ratings'        // el modelo necesita ratings y el snapshot no los trae
  | 'invalid_cutoff';        // el snapshot usa datos posteriores al corte del contexto
```

`PredictionOutput` es `Prediction` sin `id`/`matchId`/fechas: marcador, goles esperados, confianza, factores, `modelVersion`, probabilidades 1X2.

Los motores viven en `packages/prediction/src/footballV{1,2,3}.ts` y se registran en `engine.ts`:

```ts
getPredictionEngine('football-v3').predict(ctx, snapshot);
listModelVersions();        // ['football-v1', 'football-v2', 'football-v3']
DEFAULT_MODEL_VERSION;      // 'football-v3'
predictionEngine;           // el default, usado por API y worker
```

Cambiar el modelo en producción es cambiar una constante. Los modelos viejos se conservan para comparar en backtesting.

## De dónde salen las features

```text
store.listMatches()
   │
   ▼
buildFinishedHistory(matches)          → FinishedMatchResult[] ordenado, sin seed si hay datos reales
   │
   ├──► fitDixonColes({ history, cutoffAt })   → DixonColesFit (ratings de todos los equipos)
   │          │
   │          └── fit.matchRatings(homeId, awayId) → MatchRatings
   │
   └──► buildFeatureSnapshot({ matchId, homeTeamId, awayTeamId,
                               matchScheduledAt, dataCutoffAt, history, ratings })
              → FeatureSnapshot
```

`buildFeatureSnapshot` (`packages/features/src/buildFeatureSnapshot.ts`) calcula, **solo con partidos anteriores a `dataCutoffAt`**:

- `homeForm`/`awayForm`: últimos 5 resultados (`'W' | 'D' | 'L'`), del más antiguo al más reciente.
- `homeAttack`/`awayAttack`: goles a favor por partido. `homeDefense`/`awayDefense`: goles en contra por partido. (Si no hay historial, 1.)
- `homeStrength`/`awayStrength`: combinación lineal heurística; la usa `hasMinimumPredictionData` y v1.
- `restDaysHome`/`restDaysAway`: días desde el último partido.
- `injuryImpact*`, `squadChange*`: goles esperados que se restan por bajas conocidas antes del corte (`teamAvailability`). 0 si no hay datos. v3 las aplica igual que v1/v2 y añade el factor `home_availability` / `away_availability`.
- `dataCompleteness`: 0.35 sin forma; 0.75 + 0.04 × min(partidos de forma), tope 0.95.
- `ratings`: los `MatchRatings` que se le pasen (o `null`).

### Corte temporal (`dataCutoffAt`)

- **Partido futuro** (análisis/generación): `min(ahora, kickoff − 5 min)`.
- **Backtest**: `kickoff − 1 h`, simulando que predecimos justo antes del partido sin conocerlo.

El motor rechaza con `invalid_cutoff` cualquier snapshot cuyo `dataCutoffAt` sea posterior al del contexto. Esto es una red de seguridad contra fugas de información.

## Los tres modelos

### `football-v1` (baseline histórico)

Goles esperados a partir de promedios crudos, marcador `round(xG)`, confianza heurística. Medido: acierto de ganador 36 % (peor que apostar siempre al local, 46 %), confianza declarada 95 % con acierto real 34 %. Se conserva solo como referencia de cuánto hemos mejorado. No tiene `outcomeProbabilities` (`null`).

### `football-v2` (Poisson con encogimiento)

1. Ratios ataque/defensa relativos a la media de liga (1.35 goles), **encogidos** hacia 1 según `dataCompleteness` (peso en [0.3, 0.55]). Con poca evidencia, el equipo se parece a la media.
2. Goles esperados: `λ = 1.5 × ataque_local × defensa_visitante × forma_local`, `μ = 1.2 × ataque_visitante × defensa_local × forma_visitante`, acotados a [0.2, 4.0].
3. Distribución conjunta de marcadores asumiendo Poisson independientes (matriz 9×9).
4. Probabilidades 1X2 = suma de celdas; resultado predicho = argmax.
5. Marcador titular = la celda más probable **dentro del resultado predicho** (nunca mostramos "1-1" si el modelo cree que gana el local).
6. Confianza = P(resultado predicho), acotada a [5, 95].

### `football-v3` (Dixon-Coles) — por defecto

La diferencia conceptual con v2: en lugar de promedios por equipo, los ratings se **ajustan conjuntamente** sobre todos los partidos del historial, de modo que marcar 2 goles al mejor defensor vale más que marcárselos al peor. Además se estiman la ventaja de local y la correlación de marcadores bajos a partir de los datos.

#### Ajuste (`fitDixonColes`, en `packages/features/src/dixonColes.ts`)

Para cada partido anterior al corte, con peso `w = exp(−ln2 · edad_días / halfLifeDays)`:

- **Ataque** `α_i` y **defensa** `β_i` por equipo, actualizados alternadamente con la forma cerrada de la verosimilitud Poisson ponderada:
  `α_i = Σ w·goles_a_favor / Σ w·β_rival·(γ si local)`, `β_i = Σ w·goles_en_contra / Σ w·α_rival·(γ si rival local)`.
- **Ventaja de local** `γ = Σ w·goles_local / Σ w·α_local·β_visitante`.
- Identificabilidad: se normaliza la media de `α` a 1 en cada iteración.
- **Prior**: a cada equipo se le añaden `priorWeight` (6) "partidos virtuales" a `priorAttack` (0.9) y `priorDefense` (1.1) de la media. Un recién ascendido empieza ligeramente por debajo de la media y converge a su nivel real con los datos.
- **ρ** (dependencia de marcadores bajos) se maximiza por búsqueda áurea en [−0.25, 0.2] sobre los partidos con ≤1 gol por lado.

`iterations: 30` basta para converger. Un ajuste completo sobre 6 000 partidos tarda ~10 ms.

Hiperparámetros por defecto (`DEFAULT_DIXON_COLES_OPTIONS`) elegidos por barrido sobre backtests 2022–2024: `halfLifeDays: 365`, `priorWeight: 6`, `priorAttack: 0.9`, `priorDefense: 1.1`. La superficie es plana entre 365 y 730 días; cualquier valor ahí da resultados equivalentes.

#### Predicción (`predictV3`)

- `λ = α_local × β_visitante × γ`, `μ = α_visitante × β_local`, acotados a [0.2, 4.0].
- Distribución Poisson con corrección Dixon-Coles: cada celda (h, a) se multiplica por `τ(h, a, λ, μ, ρ)` (`dixonColesTau` en `shared`), que ajusta solo 0-0, 1-0, 0-1 y 1-1; después se renormaliza.
- Resultado, marcador y confianza igual que v2.
- Exige `snapshot.ratings` con `model: 'dixon-coles'`; si no, `missing_ratings`.

#### Factores explicativos de v3

Ordenados por `impact` descendente:

| `feature` | Cuándo aparece | Texto (ejemplo) |
|---|---|---|
| `home_attack_rating` / `away_attack_rating` | si `|α − 1| ≥ 0.03` | "Arsenal tiene un ataque superior a la media ajustado por rivales" |
| `home_defense_rating` / `away_defense_rating` | si `|β/media − 1| ≥ 0.03` | "Bayern defiende mejor que la media ajustado por rivales" |
| `home_advantage` | si `|γ − 1| ≥ 0.03` | "Arsenal juega de local (ventaja estimada 18%)" |
| `low_score_dependency` | si `|ρ| ≥ 0.02` | "Los marcadores 1-0 y 0-1 son más frecuentes de lo que indica Poisson puro" |
| `thin_history` | si algún equipo tiene < 6 partidos previos | "Pocos partidos previos para X; el rating se acerca a la media de la liga" |
| `balanced_match` | si `|P(local) − P(visitante)| < 0.08` | "Partido muy equilibrado según la distribución de goles" |

Las explicaciones son plantillas deterministas en español. No hay generación de texto.

## Evaluación y backtesting

### Métricas (`evaluatePrediction`)

Para una predicción y un resultado real:

- `exactScore`: marcador exacto.
- `winnerImpliedMatch`: el 1X2 implícito del marcador coincide con el real.
- `brierScore`: `Σ (p_k − y_k)²` sobre k ∈ {local, empate, visitante}. 0 perfecto, 2 pésimo, 0.667 = uniforme.
- `logLoss`: `−ln p(resultado real)`. 1.0986 = uniforme.

Brier y log loss miden la **calidad de las probabilidades**, que es lo que realmente importa. El acierto de ganador es intuitivo pero engañoso: "siempre gana el local" acierta 46 %.

### Backtest walk-forward (`AnalysisService.runBacktest(modelVersion)`)

1. Carga historial sin seed, equipos y competiciones.
2. Objetivos = partidos terminados de competiciones **featured** (las de soporte alimentan ratings pero no se evalúan, para que las métricas sean comparables entre corridas).
3. Para cada objetivo, con `cutoff = kickoff − 1 h`: ratings y snapshot con solo historial anterior, predice con el modelo pedido, evalúa.
4. Agrega con `summarizeBacktest` (`apps/api/src/analysis/backtest.ts`): tasas globales, Brier/log loss, **RPS**, por competición, **por temporada** (julio–junio), **líneas base** (`always_home`, `uniform`, `base_rates`, cada una con RPS) y **calibración** por tramos de confianza (0–40, 40–50, …, 80–100 %).
5. Persiste en `backtest_runs` y devuelve el registro.

Optimización importante: `RatingsCache` ajusta Dixon-Coles **una vez por corte distinto** (cortes que ven el mismo número de partidos previos comparten ajuste). Sin esto, un backtest tardaría minutos; con esto, ~1.5 s.

### Cómo leer la calibración

Si en el tramo "70–80 %" la confianza media es 0.74 y el acierto observado 0.75, el modelo está calibrado: cuando dice 74 %, acierta 74 % de las veces. v1 decía 95 % y acertaba 34 %. v3 está dentro de ±4 puntos en todos los tramos con muestra suficiente.

### Resultados de referencia (octubre 2026, 2 881 partidos)

| Modelo | Ganador | Exacto | Brier | Log loss |
|---|---|---|---|---|
| siempre local (baseline) | 45.9 % | — | 0.640 | 1.059 |
| football-v1 | 36.2 % | 11.2 % | — | — |
| football-v2 | 53.4 % | 11.0 % | 0.594 | 0.999 |
| **football-v3** | **53.9 %** | **11.2 %** | **0.582** | **0.978** |

Por competición (v3): Premier 0.578, La Liga 0.591, Champions 0.574. Para contexto, un Dixon-Coles académico sobre ligas top ronda Brier 0.57–0.59; las casas de apuestas, ~0.55.

## Cómo añadir un modelo nuevo (`football-v4`)

1. Crea `packages/prediction/src/footballV4.ts` exportando `FOOTBALL_V4_MODEL_VERSION` y `predictV4: PredictFn`. Reutiliza `buildScoreDistribution`, `argmaxOutcome` y el patrón `pickScoreForOutcome` si tu modelo produce goles esperados.
2. Si necesitas features nuevas, añádelas a `FeatureSnapshot` (`domain`) con valor por defecto `null`/`0`, calcúlalas en `features`, y actualiza los `buildFixture` de los specs existentes.
3. Regístralo en `engine.ts` (`ENGINES`). **No** cambies `DEFAULT_MODEL_VERSION` todavía.
4. Escribe `footballV4.spec.ts`: probabilidades suman 1, marcador coherente con el favorito, `invalid_cutoff`, y al menos una propiedad específica del modelo.
5. Exporta desde `index.ts`.
6. Levanta la API y compara: `POST /admin/backtests {"model":"football-v4"}` vs `{"model":"football-v3"}` (o desde Admin → Evaluación de modelos). Mira Brier/log loss **y** calibración. Si tiene hiperparámetros, haz un barrido con un script temporal fuera del repo (ver [07-flujo-de-trabajo](./07-flujo-de-trabajo.md#experimentos-con-el-modelo)).
7. Solo si mejora de forma consistente (global y por competición, sin romper calibración): cambia `DEFAULT_MODEL_VERSION`, actualiza el CHANGELOG y, tras desplegar, ejecuta "Regenerar con modelo actual" en Admin.

## Qué no hace el modelo (y por qué)

- **No usa cuotas de apuestas.** El PRD las excluye del MVP. Sería una línea base valiosa en backtesting, pero no una feature.
- **No usa lesiones ni alineaciones.** No hay fuente. Los campos existen en el snapshot para cuando la haya.
- **No usa xG.** Idem.
- **No genera texto con LLM.** Las explicaciones son plantillas; es una regla de arquitectura.
- **No muestra 1X2 al usuario final.** Las probabilidades se calculan y persisten, y se ven en Admin, pero la página pública de análisis no las renderiza (PRD: V2).
