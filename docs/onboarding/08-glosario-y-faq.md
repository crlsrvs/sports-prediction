# 8. Glosario y preguntas frecuentes

## Glosario

### Dominio y producto

**Competición featured / support.** Featured: liga visible en el producto (`Competition.active = true`): UCL, Premier, La Liga. Support: liga que solo alimenta el modelo (`active = false`): Bundesliga, Serie A, Ligue 1.

**Data mode (`seed` / `live`).** `live` si existe al menos un partido de una fuente real (`isLiveSourceId`: cualquiera distinta del seed); si no, `seed`. Determina el banner del dashboard y si el historial descarta los resultados de demostración.

**Entidad sin resolver.** Nombre de equipo que llegó de una fuente y no coincidió con ningún equipo conocido ni alias. Se crea un equipo provisional (`team-af-<id>`) y se pide revisión en Admin.

**Alias.** Nombre alternativo de un equipo (`Man City`, `Manchester City FC`). El ingest resuelve nombres por alias exacto o normalizado.

**MatchCard.** DTO de una tarjeta del dashboard: partido, equipos, competición, forma reciente, última predicción.

**MatchAnalysis.** DTO de la página de análisis: lo anterior más snapshot de features, comparación, evaluación y motivo de no disponibilidad.

**RAW.** Payload crudo de una respuesta externa, guardado tal cual con checksum. Temporal (30 días).

**Seed.** Datos de demostración sembrados al crear la base: 3 competiciones, 8 equipos, 26 resultados ficticios fechados en 2026, 3 partidos programados.

### Modelado

**dataCutoffAt.** Instante hasta el cual el modelo puede "ver" datos. Todo lo posterior es futuro y está prohibido. 5 min antes del kickoff en producción, 1 h antes en backtest.

**FeatureSnapshot.** Conjunto de variables calculadas para un partido a un corte dado: forma, promedios, descanso, completitud, ratings.

**Forma reciente.** Últimos 5 resultados de un equipo como `W`/`D`/`L`.

**Goles esperados (λ, μ / xG del modelo).** Media de la distribución de goles del local (λ) y del visitante (μ). No confundir con el xG de proveedores de datos (basado en tiros), que no usamos.

**Poisson.** Distribución discreta que modela "número de goles en un partido" dada una media. `P(k) = e^{-λ} λ^k / k!`. Asumir goles de local y visitante independientes da una matriz de probabilidades de marcadores.

**Dixon-Coles.** Modelo de 1997 que mejora el Poisson independiente con (1) ratings de ataque/defensa por equipo ajustados por rival, (2) ventaja de local explícita, (3) un parámetro ρ que corrige la frecuencia de 0-0, 1-0, 0-1 y 1-1, y (4) decaimiento temporal. Es nuestro `football-v3`.

**Rating de ataque (α).** Multiplicador sobre la media de liga: 1.3 = marca 30 % más que un equipo medio frente a una defensa media. **Rating de defensa (β).** Goles que concede por partido frente a un ataque medio; menor es mejor.

**Ventaja de local (γ).** Multiplicador sobre los goles esperados del local; estimado ~1.18 en nuestros datos.

**ρ (rho).** Parámetro de dependencia de marcadores bajos. Negativo infla 0-0 y 1-1; positivo infla 1-0 y 0-1. Estimado por máxima verosimilitud en [−0.25, 0.2].

**Encogimiento (shrinkage) / prior.** Tirar una estimación hacia un valor de referencia cuando hay pocos datos. En Dixon-Coles añadimos 6 "partidos virtuales" a 0.9/1.1 de la media para que un equipo nuevo no tenga ratings extremos por 2 partidos.

**Vida media (half-life).** Días tras los cuales el peso de un partido se reduce a la mitad. 365 por defecto.

**Resultado implícito / 1X2.** Local gana, empate o visitante gana. `outcomeProbabilities` guarda las tres probabilidades.

**Confianza.** Probabilidad del resultado predicho, en porcentaje. Si dice 60 %, el modelo cree que acertará el ganador 6 de cada 10 veces. Está **calibrada**: en backtest, cuando dice 60 % acierta ~60 %.

**Marcador más probable consistente.** Entre todos los marcadores compatibles con el resultado más probable, el de mayor probabilidad. Evita mostrar "1-1" cuando el modelo cree que gana el local.

**Factor.** Una explicación determinista de la predicción: `feature`, `value`, `impact`, `direction`, `explanation`.

### Evaluación

**Backtest walk-forward.** Recorrer los partidos terminados en orden cronológico y predecir cada uno usando solo lo anterior. Simula cómo habría funcionado el modelo en producción.

**Acierto de ganador (winner rate).** Fracción de partidos donde el 1X2 implícito coincidió con el real. Línea base "siempre local": ~46 %.

**Marcador exacto (exact score rate).** Fracción con el marcador exacto. Techo práctico ~12 %.

**Brier score.** `Σ (p_k − y_k)²` sobre los tres resultados. 0 perfecto, 0.667 uniforme, 2 pésimo. Nuestra métrica principal.

**Log loss.** `−ln p(resultado real)`. 1.0986 uniforme. Castiga más las probabilidades muy equivocadas.

**RPS (Ranked Probability Score).** Variante de Brier que respeta el orden local > empate > visitante. Rango [0, 1]; un pronóstico uniforme vale 5/18 en victoria y 1/9 en empate. Sale en el backtest y en la temporada en vivo junto a Brier.

**MAE de goles.** Error absoluto medio del marcador (local + visitante). Métrica secundaria.

**Línea base (baseline).** Modelo trivial con el que comparar: `always_home` (siempre local con frecuencias históricas), `uniform` (1/3 cada uno), `base_rates` (frecuencias observadas).

**Calibración.** Comparar la confianza declarada con el acierto observado por tramos. Un modelo calibrado tiene ambos iguales.

### Infraestructura

**AppStore.** Interfaz de persistencia. Dos implementaciones: memoria y Postgres.

**BullMQ.** Librería de colas sobre Redis. La API encola; el worker consume la cola `sports-prediction`.

**Job.** Unidad de trabajo del worker (`import-season`, `scrape-source`, ...). Nombres en `JOB_NAMES`.

**Scraping job (registro).** Fila en `scraping_jobs` que documenta una ejecución de ingesta con estado honesto.

**Adapter.** Implementación de una fuente externa: fetcher + parser + función de normalización a `NormalizedFixture`. Hoy: API-Football (historial 2022–2024) y football-data.org (temporada en curso).

**Migración.** Archivo SQL idempotente en `packages/database/migrations`, aplicado en orden en cada arranque.

## Preguntas frecuentes

**¿Por qué el dashboard muestra partidos de mayo de 2025 si estamos en octubre de 2026?**
Porque no tienes `FOOTBALL_DATA_KEY` o no has ejecutado `scrape-source`. Sin temporada en curso mostramos la jornada real más reciente antes que datos inventados. Con la clave, el dashboard muestra los partidos de hoy o la próxima jornada.

**¿Por qué el modelo casi nunca predice empate como marcador?**
Porque el marcador titular es el más probable del resultado más probable, y el empate rara vez es el resultado individual más probable (suele rondar 20–30 %). Las probabilidades de empate sí están calibradas y se ven en Admin. Mostrar 1X2 al usuario está previsto para V2 en el PRD.

**¿Por qué hay predicciones para partidos ya terminados?**
Porque las generamos para todo el historial (con corte previo al partido) y así la página de análisis puede mostrar predicción vs resultado real y la evaluación. Es la misma lógica del backtest, persistida.

**¿Puedo borrar predicciones viejas?**
No deberías. Son parte de la trazabilidad (`modelVersion` + `dataCutoffAt`). Regenerar añade, no reemplaza.

**¿Cuándo usa la API el store en memoria?**
Solo si `DATABASE_URL` está vacía (modo demo explícito) o si `STORE_ALLOW_MEMORY_FALLBACK=true` y Postgres falló (con `WARN` en consola y `storeReason` en `/health`). Si `DATABASE_URL` está definida y la base no responde, la API y el worker fallan con `StoreConnectionError` y la causa. Antes caía a memoria en silencio y una caída real parecía "datos demo".

**¿Dónde pongo una llamada HTTP a una API externa desde la API de NestJS?**
En principio en ningún sitio: las llamadas externas van al worker vía job. La única excepción actual es `POST /admin/sources/:id/test` (un `ping`), porque el admin quiere respuesta inmediata.

**¿Puedo usar Tailwind / una librería de componentes / Prisma?**
No sin un ADR que lo justifique y supere al actual. Ver ADR 0001 y 0002.

**¿Por qué `features` y `prediction` no se importan entre sí?**
Para que el motor sea reemplazable sin arrastrar el cálculo de features, y viceversa. El contrato es `FeatureSnapshot` en `domain`. Lo que ambos necesitan (`dixonColesTau`) vive en `shared`.

**¿Qué pasa si dos equipos distintos tienen el mismo nombre normalizado?**
El matcher devolvería el primero. No ha ocurrido en 234 equipos, pero es un riesgo conocido; si aparece, la solución es un alias con `source_id` específico.

**¿Cómo sé qué modelo generó lo que veo?**
`prediction.modelVersion` en cualquier respuesta; en Admin se muestra en cada predicción. `GET /admin/models` dice cuál es el default.

**¿Cuánto tarda un backtest?**
~1.5 s para ~2 900 partidos con `RatingsCache`. Sin la caché serían minutos.

**¿Qué hago si el typecheck falla en un archivo que no toqué?**
Casi siempre es porque cambiaste un tipo del dominio (p. ej. añadiste un campo obligatorio a `FeatureSnapshot`) y hay fixtures de test que lo construyen a mano. Actualízalos; es la señal de que el cambio se propagó bien.

**¿Qué sigue en el roadmap técnico?**
En orden de valor/costo: cuentas de usuario de verdad (el Admin ya tiene contraseña de servidor y sesión de 12 h, ver [ADR 0006](../adr/0006-admin-session.md)); una fuente de bajas que cubra la temporada en curso en el plan gratuito (el cálculo ya está, pero API-Football free suele rechazar 2026); más señal en el modelo una vez esa fuente exista. Scheduler, evaluación en vivo, RPS por temporada, CI, imágenes compiladas y la receta de despliegue ya existen. El PRD (§49–54) detalla las iteraciones de producto.
