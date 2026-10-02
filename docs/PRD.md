# PRD — Plataforma de análisis y predicción deportiva

**Versión:** 1.0  
**Estado:** Ready for Initial Development  
**MVP:** Football  
**Fase posterior:** Baseball + Premium  
**Idioma inicial:** Español, arquitectura preparada para i18n

---

## 1. Visión del producto

Construir una plataforma web que recopile información deportiva desde múltiples fuentes, la normalice en un modelo de datos común y genere análisis y estimaciones deportivas mediante un motor matemático independiente.

El producto comenzará con **fútbol**, específicamente:

- UEFA Champions League
- Premier League
- La Liga

La arquitectura será genérica para permitir posteriormente:

- MLB
- otros deportes
- nuevas competiciones
- nuevos proveedores de datos
- nuevos modelos de predicción

El producto no estará inicialmente orientado a apuestas. Las cuotas se incorporarán en una fase posterior.

La idea central es:

```text
Fuentes
   ↓
Ingesta / Scraping
   ↓
Datos RAW
   ↓
Normalización
   ↓
Base de datos
   ↓
Feature Engine
   ↓
Prediction Engine
   ↓
API
   ↓
Frontend

```

---

# 2. Objetivos del MVP

## Objetivos principales

El MVP debe permitir:

1. Obtener datos históricos y actuales de competiciones de fútbol.
2. Consolidar información proveniente de distintas fuentes.
3. Identificar correctamente equipos, jugadores y competiciones aunque las fuentes utilicen nombres diferentes.
4. Mantener cada dato asociado a un contexto temporal.
5. Calcular métricas de rendimiento de equipos.
6. Generar una estimación de marcador para partidos.
7. Explicar de forma matemática qué factores influyeron en la estimación.
8. Generar automáticamente análisis para los partidos del día.
9. Permitir analizar manualmente un partido.
10. Comparar posteriormente la predicción con el resultado real.
11. Mantener historial interno de predicciones para evaluar el modelo.
12. Proporcionar un panel administrativo para gestionar deportes, competiciones, fuentes, entidades y jobs.
13. Detectar problemas en las fuentes de datos.
14. Mantener el motor de predicción desacoplado del resto de la aplicación.

---

# 3. Fuera del MVP

Quedan explícitamente para fases posteriores:


| Funcionalidad                         | Fase                       |
| ------------------------------------- | -------------------------- |
| Predicción 1X2 visible al usuario     | V2                         |
| Favoritos persistentes por usuario    | V2                         |
| Registro / Login                      | V2                         |
| MLB                                   | V2                         |
| Predicciones live                     | Premium                    |
| Partidos posteriores al día actual    | Premium                    |
| Cuotas deportivas                     | V2                         |
| Over/Under                            | Premium                    |
| Ambos equipos marcan                  | Premium                    |
| Goles por equipo                      | Premium                    |
| Predicciones de jugadores             | Premium                    |
| Pitcher ganador                       | Premium                    |
| Hits / Strikeouts                     | Premium                    |
| Histórico avanzado visible al usuario | V2                         |
| Reentrenamiento automático ML         | V3                         |
| LLM                                   | Fuera de roadmap inmediato |
| App móvil                             | Futuro                     |


---

# 4. Usuarios

## MVP

La aplicación será pública y no requerirá cuentas.

Esto reduce complejidad en la primera versión y permite probar rápidamente el producto con usuarios reales.

Las preferencias locales pueden almacenarse en el navegador posteriormente.

## V2

Se incorporará:

```text
User
├── Profile
├── Favorite teams
├── Favorite competitions
├── Favorite sports
├── Prediction history
└── Personal dashboard

```

La arquitectura del MVP debe evitar decisiones que dificulten esta incorporación.

---

# 5. Experiencia principal

## Home / Dashboard

La pantalla principal mostrará los partidos del día.

Ejemplo:

```text
TODAY

Champions League

Barcelona
vs
Real Madrid

[ Analizar ]

Arsenal
vs
Bayern Munich

[ Analizar ]

```

Cada partido mostrará información resumida:

```text
Barcelona vs Real Madrid
14:00

Barcelona
Real Madrid

Forma reciente
W W D W W
W D W L W

Predicción
Marcador estimado: 2 - 1

Confiabilidad de la estimación
74%

Principales factores
+ Localía
+ Forma reciente
+ Rendimiento ofensivo
- Ausencias importantes

```

El dashboard deberá ofrecer filtros por:

```text
Sport
Competition
Date
Team

```

---

# 6. Pantalla de análisis de partido

Ejemplo:

```text
Barcelona vs Real Madrid

Champions League
Fecha / hora

──────────────────────────

Marcador estimado
Barcelona 2 - 1 Real Madrid

──────────────────────────

Análisis

Barcelona
Forma: W W D W W

Real Madrid
Forma: W D W L W

──────────────────────────

Comparación

Ataque
Barcelona      ████████
Real Madrid    ███████

Defensa
Barcelona      ██████
Real Madrid    ████████

Forma reciente
Barcelona      █████████
Real Madrid    ███████

Localía
Barcelona      ████████

──────────────────────────

Factores principales

Positivos
+ Ventaja de local
+ Mejor rendimiento ofensivo reciente

Negativos
- Ausencia de jugador importante

```

Los factores deben ser generados **directamente por el motor matemático**, no por un LLM.

---

# 7. Arquitectura general

```text
                         External Sources
                              │
                 ┌────────────┼────────────┐
                 ↓            ↓            ↓
              API Source   Web Source   Web Source
                 │            │            │
                 └────────────┼────────────┘
                              ↓
                       Ingestion Layer
                              ↓
                        RAW Data Store
                              ↓
                    Normalization Layer
                              ↓
                         PostgreSQL
                              ↓
                      Feature Engine
                              ↓
                     Prediction Engine
                              ↓
                         NestJS API
                              ↓
                     React + TypeScript

```

Los procesos periódicos serán ejecutados mediante:

```text
Redis
   ↓
BullMQ
   ↓
Workers

```

BullMQ está orientado precisamente a jobs en background, retries, delayed jobs, scheduling y concurrencia sobre Redis.

---

# 8. Stack tecnológico

## Frontend

```text
React
TypeScript
Vite
Recharts
React Query / TanStack Query

```

## Backend

```text
NestJS
TypeScript
REST API

```

## Scraping

```text
Playwright

```

Se priorizará Playwright por permitir trabajar con páginas dinámicas y mantener inicialmente un solo ecosistema Node/TypeScript. La documentación actual de Playwright soporta Node.js moderno y ejecución automatizada de navegadores.

## Database

```text
PostgreSQL

```

PostgreSQL será la fuente de verdad del sistema.

## Cache / Queue

```text
Redis
BullMQ

```

## Deployment inicial

Objetivo:

```text
Frontend → Vercel
PostgreSQL → Neon
Redis → Upstash
Backend / Workers → proveedor con free tier compatible

```

Vercel mantiene un plan Hobby gratuito para proyectos personales y pequeños, mientras que Neon ofrece PostgreSQL con plan gratuito y compute con escala a cero; Upstash ofrece Redis gratuito para prototipos con límites de 256 MB y 500K comandos mensuales.

Render también ofrece web services gratuitos, aunque su propia documentación advierte que sus recursos Free están pensados para pruebas/proyectos y que su PostgreSQL Free expira después de 30 días, por lo que **no lo utilizaremos como base de datos principal**.

Vercel tampoco será el scheduler principal porque Cron en Hobby está limitado a una ejecución diaria, incompatible con nuestras actualizaciones subdiarias.

La infraestructura deberá ser intercambiable para migrar posteriormente a AWS.

---

# 9. Fuentes de datos

El sistema soportará dos tipos:

```text
A. APIs
B. Websites / scraping

```

Las APIs serán preferidas cuando exista una alternativa adecuada.

## Fuentes candidatas iniciales

### API-Football

Actualmente ofrece un plan gratuito de 100 requests/día y endpoints para:

- leagues
- standings
- teams
- fixtures
- head-to-head
- events
- lineups
- players
- transfers
- injuries
- statistics
- predictions

La cobertura disponible puede variar por competición y temporada.

Esta será una de las primeras fuentes que debemos probar durante el desarrollo.

### [football-data.org](http://football-data.org)

Puede servir especialmente como fuente secundaria para resultados, partidos y estructura de competiciones. Su API dispone de filtros por temporada, fecha, status, venue, etc., aunque tiene limitaciones de rate limiting y cobertura según el plan.

### TheSportsDB

Puede utilizarse como fuente complementaria para equipos, jugadores, competiciones y calendarios. Dispone de API gratuita, aunque sus límites de la capa Free varían según endpoint.

### UEFA / sitios oficiales

Los sitios oficiales de las competiciones pueden servir como fuentes de verificación para calendarios y resultados. UEFA, por ejemplo, publica directamente fixtures y resultados de Champions League.

### SofaScore

**No será una dependencia del MVP.**

Aunque contiene información muy útil, sus condiciones actuales prohíben la extracción/agregación mediante scraping sin consentimiento expreso y restringen el uso comercial de la plataforma.

Esto no significa que nunca pueda utilizarse; significaría evaluar posteriormente una vía autorizada/API comercial.

---

# 10. Arquitectura de fuentes

Cada fuente tendrá un adapter:

```text
DataSource
   ↓
SourceAdapter
   ↓
Fetcher
   ↓
Parser
   ↓
Normalizer

```

Ejemplo:

```text
ApiFootballAdapter
FootballDataAdapter
UefaWebAdapter
CustomWebsiteAdapter

```

El resto del sistema no debe conocer la implementación de cada fuente.

---

# 11. Prioridad de fuentes

Se utilizará una estrategia de prioridad.

Ejemplo:

```text
Metric: fixture score

Priority:
1. API-Football
2. UEFA
3. football-data.org

```

Pero se almacenarán todas las observaciones.

Ejemplo:

```text
Source A
xG = 1.42
fetched_at = 12:00

Source B
xG = 1.38
fetched_at = 12:05

```

El sistema resolverá cuál es el valor canónico utilizando:

```text
priority
+
freshness
+
data quality

```

La fuente elegida quedará registrada.

---

# 12. Scraping semi-automático

No intentaremos que una URL arbitraria se convierta mágicamente en un scraper perfecto en V1.

El MVP utilizará:

```text
Admin
 ↓
Add Source
 ↓
URL
 ↓
Sistema inspecciona página
 ↓
Detecta:
- tablas
- links
- JSON embedded
- structured data
- posibles campos
 ↓
Admin confirma mapping
 ↓
Source Adapter / configuration
 ↓
Enable

```

Ejemplo:

```text
Source field
"Home Team"

        ↓

Canonical field
match.homeTeam

```

La configuración avanzada de selectores/mappings podrá incorporarse posteriormente.

---

# 13. RAW data

Cada ejecución de scraping deberá generar temporalmente:

```text
RawScrape
├── source
├── URL
├── fetchedAt
├── statusCode
├── contentType
├── payload
├── checksum
└── metadata

```

Los datos RAW se conservarán **temporalmente**.

Objetivo:

- debugging
- reproducibilidad
- parser recovery
- auditoría

No deben convertirse en el almacenamiento histórico permanente del sistema.

El sistema deberá ejecutar una política de expiración:

```text
RAW retention:
7–30 días

```

El valor exacto puede ajustarse después de medir almacenamiento.

---

# 14. Normalización

Esta será una de las partes críticas del sistema.

Una fuente puede escribir:

```text
Manchester City
Man City
Man City FC
Manchester City FC

```

Nuestro sistema debe representarlo como:

```text
Team
id: 123
canonicalName: Manchester City

```

La entidad tendrá aliases:

```json
{
  "aliases": [
    "Manchester City",
    "Man City",
    "Man City FC",
    "Manchester City FC"
  ]
}

```

Además deberá existir un mecanismo de matching.

Proceso:

```text
Incoming value
      ↓
Exact alias?
      ↓ yes
Canonical entity

      ↓ no

Normalized text comparison
      ↓
Potential candidates
      ↓
Confidence threshold
      ↓
Automatic match OR manual review

```

El administrador podrá realizar manualmente:

```text
"Man City FC"
        ↓
Manchester City

```

---

# 15. Entidades principales

El modelo genérico deberá partir de:

```text
Sport
Competition
Season
Team
Player
Venue
Match
DataSource
RawRecord
EntityAlias
MatchStatistic
TeamStatistic
PlayerStatistic
Injury
Lineup
Prediction
PredictionSnapshot
FeatureSnapshot
ScrapingJob
PredictionJob
ModelVersion

```

---

# 16. Modelo temporal

Esta es una regla fundamental del producto:

> Una predicción solamente puede utilizar información que hubiera estado disponible en el momento en que fue generada.

Ejemplo:

```text
10:00

Data available:
- historical results
- current form
- injuries known at 10:00
- probable lineup

Prediction generated

```

Luego:

```text
12:30
Official lineup arrives

New snapshot

Prediction recalculated

```

Cada predicción deberá tener:

```text
prediction.createdAt
prediction.dataCutoffAt
prediction.modelVersion

```

Y los datos utilizados deberán ser reconstruibles.

---

# 17. Snapshots

El sistema mantendrá snapshots de:

```text
Feature Snapshot
Data Snapshot
Prediction Snapshot

```

Ejemplo:

```text
Prediction #8231

generatedAt:
2026-10-02 14:00

dataCutoff:
2026-10-02 13:55

model:
football-v1

features:
{
  homeForm: ...,
  awayForm: ...,
  homeAttack: ...,
  awayAttack: ...,
  homeDefense: ...,
  awayDefense: ...,
  injuries: ...,
  squadChange: ...
}

```

Los cambios históricos de datos se conservarán siempre que no generen un coste de almacenamiento desproporcionado.

---

# 18. Actualización de datos

Se utilizará una política conservadora.

Ejemplo inicial:

```text
Daily job
    ↓
Obtener partidos del día

Cada 6 horas
    ↓
Actualizar información importante

En las horas previas
    ↓
Actualizar con mayor frecuencia

Cuando exista lineup confirmado
    ↓
Regenerar análisis

```

No se usará polling agresivo.

El objetivo es maximizar:

```text
data freshness / request cost

```

---

# 19. Alineaciones

La alineación confirmada tendrá prioridad sobre cualquier alineación probable.

Flujo:

```text
Expected lineup
        ↓
Prediction A

Official lineup detected
        ↓
Feature snapshot actualizado
        ↓
Prediction B

```

No se esperará obligatoriamente a que sea exactamente una hora antes del partido.

La regla será:

> Cuando exista una alineación oficial nueva y relevante, recalcular.

APIs como API-Football actualmente documentan disponibilidad de lineups aproximadamente 20–40 minutos antes de un fixture en competiciones con esa cobertura.

---

# 20. Modelo de datos mínimo para un partido

Un Match deberá tener:

```text
id
sportId
competitionId
seasonId

homeTeamId
awayTeamId

scheduledAt
venueId

status

homeScore
awayScore

source
createdAt
updatedAt

```

---

# 21. Estadísticas mínimas de fútbol

Para el MVP se priorizarán:

### Match

```text
goals
shots
shotsOnTarget
possession
corners
cards

```

### Team

```text
matches
wins
draws
losses
goalsFor
goalsAgainst
goalDifference
points

```

### Advanced

Cuando exista disponibilidad:

```text
xG
xGA

```

### Contexto

```text
home / away
daysRest
recentForm
ranking
headToHead

```

### Plantilla

```text
playersIn
playersOut
playerContribution

```

### Disponibilidad

```text
injured
suspended
available

```

Los campos avanzados serán opcionales.

---

# 22. Datos mínimos obligatorios

No debe existir una dependencia absoluta de todas las variables.

Para generar un análisis válido tendremos un dataset mínimo:

```text
✓ Match
✓ Home team
✓ Away team
✓ Competition
✓ Historical results
✓ Current/recent form
✓ Home/Away performance

```

Opcionales:

```text
xG
shots
possession
injuries
lineup
squad changes
player statistics

```

Cuando falte información opcional:

```text
Prediction still possible
+
Data Quality reduced

```

Cuando falten datos obligatorios:

```text
Prediction unavailable

```

No se deberá inventar ni imputar arbitrariamente información crítica.

---

# 23. Feature Engine

El Feature Engine será responsable de transformar datos crudos en variables utilizables por el modelo.

Ejemplo:

```text
Raw matches
    ↓
Feature Engine
    ↓

recent_form
home_strength
away_strength
attack_strength
defensive_strength
goals_average
xg_average
rest_days
injury_impact
squad_change

```

Las features deben ser reproducibles a partir de:

```text
entity
+
competition
+
historical cutoff

```

---

# 24. Tratamiento histórico

Se utilizarán idealmente **3–5 años de histórico**, pero no se otorgará el mismo peso a todas las temporadas.

El modelo distinguirá entre:

```text
Long-term strength
+
Recent strength
+
Current squad context

```

La lógica buscada es:

```text
Equipo históricamente fuerte
+
mala temporada actual
=
no asumir automáticamente que sigue siendo fuerte

```

y:

```text
Equipo históricamente débil
+
gran temporada actual
+
mejora de plantilla
=
incremento de fuerza estimada

```

---

# 25. Fuerza del equipo

El MVP utilizará una primera aproximación simple y cuantificable.

Conceptualmente:

```text
Team Strength

= historical strength
+ recent form
+ home/away strength
+ offensive strength
+ defensive strength
+ squad change adjustment
+ availability adjustment

```

Los pesos iniciales vivirán en código.

Ejemplo conceptual:

```text
Historical strength    25%
Recent form            30%
Attack                 15%
Defense                15%
Home advantage         10%
Squad changes           5%

```

Estos valores son **parámetros iniciales**, no verdades estadísticas. Se validarán mediante backtesting antes de considerarlos definitivos.

---

# 26. Fuerza de plantilla

En V1 será deliberadamente simple.

Se calculará a partir de:

```text
Players in
Players out
+
historical contribution
+
minutes played
+
goals / assists
+
team importance

```

El resultado será algo como:

```text
Squad Change Score
+4.2

```

No se intentará construir inicialmente un sistema completo de valoración financiera de transferencias.

Si la fuente no ofrece información suficientemente fiable, el componente se omitirá.

---

# 27. Lesiones

Las lesiones podrán entrar en el MVP siempre que la fuente proporcione datos consistentes.

El cálculo inicial será:

```text
Player importance
        ↓
Availability adjustment
        ↓
Team strength adjustment

```

Un jugador de baja importancia no tendrá el mismo impacto que un jugador que participa regularmente.

Si esta fuente introduce demasiada inestabilidad en V1, el módulo podrá desactivarse sin modificar el resto del modelo.

---

# 28. Prediction Engine

El Prediction Engine será un módulo independiente.

Interfaz conceptual:

```ts
predictionEngine.predict(
  matchContext,
  featureSnapshot
)

```

Output:

```ts
{
  predictedScore: {
    home: 2,
    away: 1
  },

  expectedGoals: {
    home: 1.72,
    away: 1.11
  },

  confidence: 74,

  factors: [
    ...
  ],

  modelVersion: "football-v1"
}

```

El frontend no debe conocer ninguna fórmula interna.

Esto permite reemplazar:

```text
football-v1

```

por:

```text
football-v2
football-ml-v1
ensemble-v1

```

sin cambiar API ni frontend.

---

# 29. Cálculo del marcador

El MVP puede comenzar con un modelo estadístico basado en la estimación de goles esperados de cada equipo.

Conceptualmente:

```text
Home attacking strength
+
Away defensive strength
+
Home advantage
+
Recent form
+
other adjustments
        ↓
Expected home goals

Away attacking strength
+
Home defensive strength
+
other adjustments
        ↓
Expected away goals

```

Posteriormente se puede utilizar una distribución de Poisson para convertir esos valores en una distribución de marcadores.

Ejemplo:

```text
Barcelona expected goals = 1.72
Real Madrid expected goals = 1.11

Most probable score:
2 - 1

```

Aunque el MVP muestre solamente:

```text
Marcador estimado: 2 - 1

```

dejaremos internamente preparada la estructura para incorporar posteriormente:

```text
1X2
Goles totales
Over/Under
BTTS
Goles por equipo

```

---

# 30. 1X2

La predicción 1X2 queda **fuera de la interfaz del MVP**.

Sin embargo, la arquitectura puede mantener la capacidad de calcularla internamente a partir de la distribución de marcadores.

Esto evita rediseñar el modelo cuando llegue V2.

---

# 31. Confidence / confiabilidad

No se mostrará un porcentaje arbitrario como si fuera una certeza estadística.

## MVP

Se mostrará una medida de:

```text
Prediction Confidence

```

basada en elementos como:

```text
Data completeness
Historical sample size
Source quality
Feature availability
Model stability

```

Ejemplo:

```text
Confiabilidad
74%

Alta disponibilidad de datos
✓
Histórico suficiente
✓
Lineup confirmada
✓
Datos de múltiples fuentes
✓

```

## Premium

Posteriormente se podrá añadir:

```text
Probability uncertainty
Calibration
Historical model reliability
Prediction interval

```

---

# 32. Explicabilidad

La explicación será generada por reglas deterministas.

Ejemplo:

```text
+ Barcelona tiene mejor forma en sus últimos 5 partidos
+ Barcelona tiene ventaja de local
+ Barcelona tiene mejor promedio ofensivo reciente

- Barcelona tiene una baja importante

```

Cada factor deberá tener:

```text
feature
value
impact
direction
explanation

```

Ejemplo interno:

```json
{
  "feature": "recent_form",
  "impact": 0.18,
  "direction": "positive"
}

```

No se usará LLM.

---

# 33. Predicciones históricas

Cada predicción deberá almacenarse.

```text
Prediction
├── match
├── generatedAt
├── dataCutoffAt
├── modelVersion
├── predictedScore
├── confidence
├── featureSnapshot
└── status

```

Una vez finalizado el partido:

```text
Actual score
      ↓
Evaluation job
      ↓
Prediction result

```

Ejemplo:

```text
Prediction
2 - 1

Actual
2 - 0

Score exact: ✗
Winner implied by score: ✓

```

El histórico avanzado quedará inicialmente disponible para administración y validación.

---

# 34. Backtesting

Será parte del MVP como herramienta interna.

Proceso:

```text
Historical matches
        ↓
Simulate historical cutoff
        ↓
Calculate available features
        ↓
Generate prediction
        ↓
Compare with actual result
        ↓
Metrics

```

Se evaluarán inicialmente:

```text
MAE de goles
Error del marcador
Brier Score / Log Loss
Calibración

```

Cuando 1X2 sea expuesto en V2, se añadirán sus métricas específicas.

El objetivo no será demostrar que el modelo "acierta mucho", sino medir objetivamente su desempeño y detectar sobreajuste.

---

# 35. Admin Dashboard

La sección administrativa tendrá:

```text
Dashboard
Sports
Competitions
Seasons
Teams
Players
Data Sources
Scraping Jobs
Predictions
Model
Backtesting
System Health

```

---

# 36. Gestión de deportes

El sistema deberá permitir:

```text
Create sport
Edit sport
Activate / deactivate sport

```

Ejemplo:

```text
Football
Baseball
Basketball
Tennis

```

Cada deporte podrá registrar posteriormente:

```text
metrics
entities
prediction strategy

```

---

# 37. Gestión de competiciones

Ejemplo:

```text
Football

Champions League
Premier League
La Liga

```

Configuración:

```text
name
sport
country
source ids
active
season

```

La estructura debe permitir posteriormente:

```text
MLB
La Liga
NBA
NFL

```

sin cambiar el esquema principal.

---

# 38. Gestión de entidades

El administrador podrá:

```text
Create Team
Edit Team
Add alias
Remove alias
Merge entities
Match unresolved entity

```

Ejemplo:

```text
Canonical:
Manchester City

Aliases:
[
  "Manchester City",
  "Man City",
  "Man City FC",
  "Manchester City FC"
]

```

---

# 39. Source Monitoring

Cada fuente deberá mostrar:

```text
Health
Last successful scrape
Last failure
Consecutive failures
Records extracted
Records expected
Extraction anomalies
Average duration

```

Estados:

```text
Healthy
Warning
Broken
Disabled

```

Ejemplo:

```text
API-Football
● Healthy
Last success: 16:30
Records: 124
Errors: 0

Source B
● Warning
Last success: 10:30
Anomalies: 7

```

---

# 40. Scraping jobs

Cada job deberá tener:

```text
id
source
startedAt
finishedAt
status
recordsFound
recordsProcessed
recordsFailed
error

```

Estados:

```text
queued
running
success
partial
failed

```

---

# 41. Resiliencia

El sistema implementará:

```text
Rate limiting
Retry with exponential backoff
Caching
Request deduplication
Timeouts
Circuit breaker
Structured logging

```

El sistema deberá evitar solicitudes innecesarias y nunca intentar mantener una fuente viva mediante scraping agresivo.

También se registrará siempre:

```text
source
url
timestamp
request type
response

```

---

# 42. Cumplimiento

Antes de activar una fuente:

```text
Source review
├── robots.txt
├── Terms
├── rate limits
├── API licensing
└── commercial-use restrictions

```

La aplicación deberá priorizar fuentes con APIs públicas/autorizadas.

Esto es particularmente importante porque algunas plataformas deportivas restringen explícitamente scraping, agregación o extracción automatizada; SofaScore es un ejemplo actual.

---

# 43. Dashboard de administración del modelo

En V1 los pesos permanecen en código.

Pero la arquitectura deberá permitir posteriormente:

```text
Model configuration
├── parameters
├── weights
├── version
├── training period
└── activation date

```

Cada predicción guardará:

```text
modelVersion

```

Por tanto:

```text
football-v1

```

y:

```text
football-v2

```

podrán coexistir históricamente.

---

# 44. Base de datos conceptual

Modelo simplificado:

```text
sports
  │
  ├── competitions
  │      │
  │      └── seasons
  │
  └── prediction_strategies

teams
players
venues

matches
  ├── home_team
  ├── away_team
  ├── competition
  └── season

match_statistics
team_statistics
player_statistics

injuries
lineups
transfers

data_sources
source_mappings
raw_records
scraping_jobs

entity_aliases
entity_match_reviews

feature_snapshots

predictions
prediction_evaluations
model_versions
backtests

```

---

# 45. API inicial

## Public

```http
GET /sports
GET /competitions
GET /matches/today
GET /matches/:id
GET /matches/:id/analysis
GET /teams/:id
GET /teams/:id/statistics

```

## Admin

```http
GET    /admin/sources
POST   /admin/sources
PATCH  /admin/sources/:id

POST   /admin/sources/:id/test

GET    /admin/scraping/jobs

GET    /admin/entities/unresolved
POST   /admin/entities/match

GET    /admin/predictions
GET    /admin/backtests

```

---

# 46. Jobs

Jobs principales:

```text
discover-todays-matches
scrape-source
normalize-source-data
update-team-statistics
calculate-features
generate-predictions
evaluate-predictions
cleanup-raw-data
source-health-check

```

Ejemplo:

```text
Daily
 ↓
discover matches
 ↓
ingest data
 ↓
normalize
 ↓
calculate features
 ↓
generate predictions

```

Luego:

```text
Lineup detected
 ↓
ingest lineup
 ↓
recalculate features
 ↓
generate new prediction

```

---

# 47. Flujo completo del MVP

```text
1. Scheduler
      ↓
2. Discover today's matches
      ↓
3. Fetch sources
      ↓
4. Store RAW records
      ↓
5. Normalize entities
      ↓
6. Resolve source priority
      ↓
7. Update canonical data
      ↓
8. Build feature snapshot
      ↓
9. Prediction Engine
      ↓
10. Store prediction
      ↓
11. API
      ↓
12. Dashboard

```

---

# 48. Tratamiento de errores

No mostrar:

```text
"Prediction unavailable because parser X crashed."

```

al usuario.

Mostrar:

```text
Análisis parcialmente disponible

Algunos datos de esta fuente no pudieron actualizarse.

```

En administración:

```text
Source X
FAILED

Reason:
HTTP 403

Consecutive failures:
4

```

---

# 49. Definition of Done — MVP

El MVP podrá considerarse funcional cuando pueda hacer este recorrido completo:

```text
Champions League
      ↓
Obtener partido
      ↓
Obtener datos históricos
      ↓
Identificar equipos
      ↓
Calcular métricas
      ↓
Calcular features
      ↓
Generar marcador estimado
      ↓
Mostrar análisis
      ↓
Guardar predicción
      ↓
Cuando termina el partido
      ↓
Comparar prediction vs actual

```

Y el administrador deberá poder:

```text
crear/activar deporte
crear competición
registrar fuente
ejecutar scraper
ver estado del scraper
resolver entidades
ver predicciones
ejecutar backtesting

```

---

# 50. Fases de desarrollo

## Fase 0 — Foundation

```text
Repository
Docker
NestJS
React
PostgreSQL
Redis
BullMQ
CI/CD
Environment configuration
Logging

```

## Fase 1 — Domain

```text
Sports
Competitions
Seasons
Teams
Players
Matches
Aliases

```

## Fase 2 — Data ingestion

```text
DataSource
Adapter
Raw storage
Parser
Normalizer
Source priority

```

## Fase 3 — Football data

Implementar:

```text
Champions League
Premier League
La Liga

```

y obtener:

```text
matches
results
standings
team statistics
basic player data

```

## Fase 4 — Feature Engine

Implementar:

```text
recent form
home/away performance
attack
defense
historical strength
rest
squad change
injury adjustment

```

## Fase 5 — Prediction Engine

Implementar:

```text
expected goals
score distribution
most probable score
confidence
factor explanations

```

## Fase 6 — Dashboard

```text
Today's matches
Match analysis
Simple charts
Prediction display

```

## Fase 7 — Evaluation

```text
Prediction history
Actual result
Backtesting
Model metrics
Admin analytics

```

## Fase 8 — Source monitoring

```text
Health
Failures
Anomalies
Retries
Alerts

```

---

# 51. Roadmap V2

Después del MVP:

```text
1. 1X2
2. User accounts
3. Persistent favorites
4. Historical dashboard
5. MLB
6. More data sources
7. Improved squad model
8. Improved injury model
9. More advanced score distribution
10. Odds integration

```

---

# 52. Roadmap Premium

La arquitectura Premium quedará definida desde ahora, aunque no se implemente todavía.

## Free

```text
Partidos del día
Marcador estimado
Análisis básico
Factores principales
Información histórica básica
Comparación prediction vs actual

```

## Premium

```text
Partidos futuros
Actualizaciones frecuentes
Lineup-driven prediction
Live predictions
Predicciones avanzadas
Goles totales
Over/Under
BTTS
Goles por equipo
Performance histórico del modelo
Mayor profundidad estadística

```

---

# 53. Premium Live

La arquitectura futura será:

```text
Match
 ↓
Pre-match prediction
 ↓
Match starts
 ↓
Live ingestion
 ↓
Feature update
 ↓
Prediction Engine
 ↓
Live prediction
 ↓
Frontend

```

No se implementará en MVP.

---

# 54. MLB V2

El modelo genérico permitirá:

```text
Sport
 ↓
PredictionStrategy
 ↓
Sport-specific features

```

Fútbol:

```text
FootballPredictionStrategy

```

Béisbol:

```text
BaseballPredictionStrategy

```

MLB incorporará posteriormente variables como:

```text
starting pitcher
bullpen
offense
defense
runs
hits
strikeouts

```

El starting pitcher se considera importante, pero se reserva para V2.

---

# 55. Principios técnicos

La aplicación debe respetar estas reglas:

### 1. Source-agnostic

El modelo nunca dependerá de un proveedor específico.

### 2. Time-aware

No utilizar información futura.

### 3. Reproducible

Una predicción debe poder reconstruirse.

### 4. Explainable

Cada resultado debe tener factores cuantificables.

### 5. Modular

Scraping, normalization, features y prediction serán módulos separados.

### 6. Sport-agnostic

Football no deberá contaminar el diseño general del dominio.

### 7. Replaceable models

El Prediction Engine podrá sustituirse sin modificar API ni frontend.

### 8. Cheap by default

Los jobs y requests estarán diseñados para minimizar consumo.

---

# 56. Primer objetivo técnico real

No recomiendo comenzar construyendo inmediatamente todo el scraping genérico.

El primer vertical slice debe ser:

```text
API-Football
     ↓
Premier League
     ↓
Today's matches
     ↓
Historical matches
     ↓
PostgreSQL
     ↓
Feature Engine
     ↓
Prediction Engine
     ↓
NestJS
     ↓
React

```

Una vez que ese flujo funcione de punta a punta:

```text
Add Champions League
Add La Liga
Add second source
Add source priority
Add admin

```

Esto reduce mucho el riesgo.

---

# 57. Primeros entregables de desarrollo

El proyecto debería comenzar con estos módulos:

```text
apps/
  web/
  api/
  worker/

packages/
  domain/
  prediction/
  scraping/
  normalization/
  database/
  shared/

```

Conceptualmente:

```text
apps/api
   ↓
orchestrates

apps/worker
   ↓
executes jobs

packages/scraping
   ↓
gets data

packages/normalization
   ↓
canonical entities

packages/prediction
   ↓
calculates predictions

packages/domain
   ↓
shared domain models

```

---

# 58. Riesgos principales

## Riesgo 1 — Calidad de datos

El mayor riesgo no será React ni NestJS.

Será:

> conseguir datos históricos consistentes y suficientemente completos.

## Riesgo 2 — Scraping

Los sitios pueden cambiar HTML, bloquear requests o modificar estructuras.

Por eso los adapters deben aislarse.

## Riesgo 3 — Entidades

La normalización de equipos/jugadores será crítica.

## Riesgo 4 — Modelo

Un modelo matemáticamente elegante no garantiza buenas predicciones.

Necesitamos backtesting desde el comienzo.

## Riesgo 5 — Costos

Playwright puede consumir muchos recursos.

Por eso el MVP debe priorizar:

```text
APIs
+
caching
+
batch requests
+
scraping selectivo

```

---

# 59. Métrica principal del producto

No será:

```text
cantidad de predicciones

```

ni:

```text
cantidad de datos recolectados

```

La métrica técnica principal será:

> **Calidad predictiva medida contra resultados reales mediante backtesting y evaluación continua.**

El producto debe poder responder:

```text
¿Este modelo funciona?
¿En qué competiciones?
¿Con qué tipo de partidos?
¿Con qué cantidad de información?
¿Con qué versión del modelo?

```

---

# 60. Decisión arquitectónica final

La arquitectura objetivo queda:

```text
                     ┌─────────────────────┐
                     │ External data       │
                     │ APIs / Websites     │
                     └──────────┬──────────┘
                                ↓
                     ┌─────────────────────┐
                     │ Scraping / Ingestion│
                     └──────────┬──────────┘
                                ↓
                     ┌─────────────────────┐
                     │ Temporary RAW data  │
                     └──────────┬──────────┘
                                ↓
                     ┌─────────────────────┐
                     │ Normalization       │
                     └──────────┬──────────┘
                                ↓
                     ┌─────────────────────┐
                     │ PostgreSQL          │
                     │ Canonical data      │
                     └──────────┬──────────┘
                                ↓
                     ┌─────────────────────┐
                     │ Feature Engine      │
                     └──────────┬──────────┘
                                ↓
                     ┌─────────────────────┐
                     │ Prediction Engine   │
                     │ football-v1         │
                     └──────────┬──────────┘
                                ↓
                     ┌─────────────────────┐
                     │ NestJS API          │
                     └──────────┬──────────┘
                                ↓
                     ┌─────────────────────┐
                     │ React Frontend      │
                     └─────────────────────┘

              Redis + BullMQ
                    │
       ┌────────────┼────────────┐
       ↓            ↓            ↓
   Scraping     Features     Predictions

```

La idea central queda reducida a una frase:

> **Construir primero una plataforma confiable de datos deportivos y un motor matemático reproducible; después aumentar la sofisticación del modelo y monetizar el acceso a información/predicciones avanzadas.**

