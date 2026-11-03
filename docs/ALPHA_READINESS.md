# Preparación de la versión alfa

Fecha de referencia: 2026-11-03. Objetivo: `0.1.0-alpha.1`, para un grupo pequeño de usuarios invitados.

**Estado: NO LISTA.** ALFA-01 está terminado; ALFA-02 a ALFA-06 siguen pendientes. Una verificación técnica aprobada no equivale a autorización de publicación ni demuestra funcionamiento con datos reales.

Este documento es el registro compartido del trabajo de cierre del alfa. Las reglas operativas siguen en [AGENTS.md](../AGENTS.md); el alcance de producto, en [PRD.md](./PRD.md), y las decisiones arquitectónicas, en [ADR](./adr/). No sustituye esos documentos ni amplía el MVP.

## Alcance mínimo

El alfa debe permitir consultar partidos de Champions League, Premier League y La Liga, abrir un análisis matemático comprensible y distinguir una predicción previa al partido de una reconstrucción histórica. El administrador debe poder sincronizar fuentes, resolver entidades y comprobar la evaluación posterior de las predicciones.

Se conservan las restricciones del MVP: sin cuentas públicas, cuotas, interfaz 1X2, predicciones en vivo ni explicaciones por LLM. No son requisitos del alfa: nuevos deportes, nuevos modelos, rediseño completo, optimización del bundle, internacionalización completa ni paridad con todas las funciones administrativas descritas para el MVP final. El acceso restringido de Admin sí es obligatorio.

## Diagnóstico de partida

La revisión local del 2026-11-03 confirmó:

- `npm run typecheck`, `npm run lint`, `npm test` y `npm run build` finalizaron correctamente; 104 tests en 33 archivos.
- La API compilada arrancó con almacenamiento demo; listado y análisis respondieron, Admin rechazó acceso anónimo con contraseña configurada y aceptó una sesión válida.
- No se verificaron PostgreSQL, Redis, proveedores reales, despliegue ni experiencia visual en navegador. Docker estaba detenido. Estas áreas siguen sin validar.
- Las métricas de backtest citadas en otros documentos no se revalidaron y no constituyen evidencia de esta versión.

## Mapa de cierre

| ID | Aspecto crítico | Estado | Dependencias |
| --- | --- | --- | --- |
| ALFA-01 | Predicciones trazables y corte temporal consistente | Terminado | — |
| ALFA-02 | Actualización y conservación de predicciones previas | Pendiente | ALFA-01 |
| ALFA-03 | Ingesta con fallos, reintentos y vigencia observables | Pendiente | — |
| ALFA-04 | Información pública comprensible y honesta | Pendiente | ALFA-01, ALFA-02, ALFA-03 |
| ALFA-05 | Protección mínima del entorno publicado | Pendiente | — |
| ALFA-06 | Validación integral y candidato desplegado | Pendiente | ALFA-01 a ALFA-05 |

Los estados admitidos son **Pendiente**, **En curso**, **Bloqueado** y **Terminado**. Cada aspecto solo pasa a Terminado cuando todos sus criterios están comprobados y existe evidencia en el registro final. Si se descubre una regresión, vuelve a En curso.

## ALFA-01 — Predicciones trazables y corte temporal consistente

**Problema.** Se guarda el resultado de la predicción, pero no sus features ni ratings originales. El análisis reconstruye métricas al consultar y las mezcla con una predicción guardada. Además, el cálculo de descanso puede incluir partidos posteriores al corte.

**Puntos de entrada:** `packages/domain/src/entities.ts`, `packages/database/src/store/{types,memoryStore,postgresStore}.ts`, `packages/database/migrations/`, `packages/features/src/buildFeatureSnapshot.ts`, `apps/api/src/analysis/analysis.service.ts` y `apps/worker/src/pipeline.ts`.

**Definición de terminado:**

- [x] Cada nueva predicción conserva de forma persistente su snapshot exacto, incluidos ratings, modelo y parámetros necesarios para repetir el cálculo, `dataCutoffAt` y fecha de generación. API y worker cumplen el mismo contrato.
- [x] El análisis de una predicción guardada utiliza su snapshot para forma, comparación y explicación. Si se muestran datos actuales adicionales, se distinguen del cálculo original.
- [x] Las predicciones anteriores sin snapshot se identifican como legado no reproducible; no se les atribuye retrospectivamente un snapshot nuevo como si fuera el original.
- [x] Todas las features respetan el corte, incluido el descanso. La reconstrucción histórica se describe como tal: no demuestra que los datos históricos se conocieran realmente en esa fecha.
- [x] Pruebas de regresión comprueban que un resultado posterior al corte no altera las features y que cambiar el historial después de guardar una predicción no altera su análisis original.
- [x] Una prueba de ida y vuelta en PostgreSQL recupera el snapshot guardado y permite repetir el resultado con el motor correspondiente. La migración conserva los registros previos.

**Evidencia mínima:** migración y contratos modificados, comandos y resultados de pruebas, ejemplo anonimizado de predicción persistida y reproducción del cálculo.

## ALFA-02 — Actualización y conservación de predicciones previas

**Problema.** La generación programada omite partidos que ya tienen una predicción. La estimación puede quedar antigua aunque se ingieran datos nuevos.

**Puntos de entrada:** `apps/worker/src/pipeline.ts`, `apps/api/src/analysis/analysis.service.ts`, `packages/shared/src/schedules.ts` y consultas de predicciones/evaluaciones en los stores.

**Definición de terminado:**

- [ ] Se define e implementa una política explícita: después de una sincronización válida, actualizar las predicciones de partidos programados dentro del horizonte vigente cuando cambien entradas relevantes, horario o versión del modelo.
- [ ] La actualización agrega una versión y conserva las anteriores; no sobrescribe la evidencia usada para evaluar el modelo.
- [ ] Repetir una ejecución sin cambios relevantes no crea versiones duplicadas. Un fallo de sincronización no presenta datos antiguos como recién actualizados.
- [ ] Al comenzar el partido se conserva la última predicción válida generada antes del inicio. La generación automática deja de actualizar ese partido.
- [ ] Las reconstrucciones o regeneraciones posteriores al inicio quedan separadas de las predicciones previas y no sustituyen su evaluación real. La selección para evaluar es determinista.
- [ ] Pruebas verifican actualización por datos nuevos, repetición sin cambios, inicio del partido y regeneración posterior sin pérdida de la predicción previa.

**Evidencia mínima:** política implementada, pruebas y ejemplo de versiones antes/después con sus fechas y predicción seleccionada para evaluación.

## ALFA-03 — Ingesta con fallos, reintentos y vigencia observables

**Problema.** Algunos fallos se devuelven como `ok: true`, por lo que la cola puede completar trabajos fallidos. Una sincronización parcial tampoco debe confundirse con una actualización completa.

**Puntos de entrada:** `apps/worker/src/pipeline.ts`, `apps/worker/src/main.ts`, `packages/scraping/src/{footballData,apiFootball}.ts`, `packages/shared/src/jobs.ts` y estado de fuentes en Admin.

**Definición de terminado:**

- [ ] El resultado distingue éxito, parcial, omitido y fallo. Si ninguna competición necesaria se actualiza, el trabajo no se informa como exitoso.
- [ ] Los fallos transitorios llegan a BullMQ y activan los intentos configurados; la política respeta los límites del proveedor. Los errores permanentes y las fuentes opcionales no configuradas se identifican sin bucles de reintento inútiles.
- [ ] Las peticiones externas tienen timeout explícito. Un proveedor que no responde no bloquea indefinidamente la sincronización.
- [ ] Una ejecución parcial conserva datos válidos, registra qué competiciones fallaron y no actualiza falsamente su fecha de éxito. La continuación de generación/evaluación tiene una regla explícita para esos casos.
- [ ] Admin permite identificar última sincronización válida, fallos y datos pendientes por competición. Se define como desactualizada la información sin sincronización válida durante más de 12 horas, equivalente a dos intervalos previstos de 6 horas.
- [ ] Pruebas con respuestas simuladas cubren timeout, HTTP 429, indisponibilidad total y fallo parcial, además de un reintento sin duplicar partidos ni entidades.

**Evidencia mínima:** pruebas de fallo/recuperación y registros de cola y de fuentes que coincidan en el resultado observado.

## ALFA-04 — Información pública comprensible y honesta

**Problema.** El porcentaje junto al marcador puede interpretarse como probabilidad de acertarlo. El título «Hoy» y el texto del proveedor pueden describir incorrectamente los datos mostrados.

**Puntos de entrada:** `apps/web/src/features/today/TodayDashboard.tsx`, `apps/web/src/features/analysis/MatchAnalysisPage.tsx`, `apps/web/src/shared/format.ts` y contratos públicos de la API.

**Definición de terminado:**

- [ ] El porcentaje actual no se presenta como probabilidad del marcador exacto ni como acierto demostrado. Se explica su significado o se retira de la vista pública, conservando fuera de ella el desglose 1X2.
- [ ] El listado distingue partidos de hoy, próximos y resultados históricos; muestra fechas y estados en español sin atribuir todos los datos a un único proveedor.
- [ ] Se muestran fecha de generación y vigencia de los datos; una sincronización de más de 12 horas de antigüedad se advierte sin insinuar actualización en vivo.
- [ ] Una reconstrucción posterior al inicio se identifica como retrospectiva y no se presenta como pronóstico realizado antes del encuentro.
- [ ] Cuando faltan datos mínimos se explica que la predicción no está disponible. Un error de red o una lista vacía tienen mensajes comprensibles y una forma de volver a intentar, sin instrucciones de desarrollo como «¿está corriendo la API?».
- [ ] Dashboard, análisis y acceso Admin se revisan en navegador a 360 px y en escritorio: sin desbordamientos que impidan usar controles, textos legibles y navegación principal por teclado funcional.

**Evidencia mínima:** capturas o registro de revisión de estados normal, histórico, datos antiguos, sin predicción y error; pruebas de componentes que ejerciten el código real de los comportamientos modificados.

## ALFA-05 — Protección mínima del entorno publicado

**Problema.** La ausencia de secretos deja Admin abierto incluso en producción. El login carece de un límite explícito de intentos.

**Puntos de entrada:** `apps/api/src/main.ts`, `apps/api/src/admin/`, `packages/database/src/createStore.ts`, `render.yaml`, `.env.example` y `docs/onboarding/09-ci-y-despliegue.md`.

**Definición de terminado:**

- [ ] En producción la API rechaza el arranque sin una credencial administrativa válida. El alfa usa `ADMIN_PASSWORD` en servidor; `VITE_ADMIN_TOKEN` queda vacío y ningún secreto se incluye en el bundle.
- [ ] El login limita intentos con una política documentada de umbral y ventana; intentos excedidos reciben HTTP 429 y no generan sesiones. Se comprueba también detrás del proxy del host elegido.
- [ ] Rutas administrativas rechazan peticiones anónimas, tokens inválidos y sesiones vencidas; una sesión válida permite las operaciones necesarias.
- [ ] El entorno publicado utiliza HTTPS y una lista explícita de orígenes CORS. Se comprueban desde navegador el origen permitido y el rechazo de uno no autorizado.
- [ ] API y worker requieren PostgreSQL en producción; no sirven una demo por falta de configuración ni por caída de la base. `STORE_ALLOW_MEMORY_FALLBACK` está desactivado.
- [ ] Las pruebas cubren configuraciones inválidas de producción, autorización y límite de login, sin guardar contraseñas, tokens ni URLs con credenciales en evidencias.

**Evidencia mínima:** pruebas, configuración descrita sin secretos y comprobaciones HTTP del candidato desplegado.

## ALFA-06 — Validación integral y candidato desplegado

**Problema.** Los controles locales actuales no prueban el flujo real ni la operación programada. La precisión del modelo en esta revisión no está acreditada.

**Puntos de entrada:** `.github/workflows/ci.yml`, `docs/onboarding/09-ci-y-despliegue.md`, pruebas de integración y entorno del candidato.

**Definición de terminado:**

- [ ] Sobre un commit identificado pasan `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`. CI confirma también los builds Docker de API y worker.
- [ ] Se prueba con PostgreSQL y Redis el recorrido ingesta → normalización → predicción persistida → API → navegador → resultado → evaluación. Hay una regresión automatizada con datos controlados y proveedores simulados, sin consumir cuotas externas en CI.
- [ ] En el candidato desplegado se verifican datos reales de las tres competiciones visibles, fuentes activas y ausencia de duplicados o entidades pendientes que impidan los análisis seleccionados. Si no hay jornada próxima, se registra esa circunstancia y se distingue el histórico.
- [ ] Se observan al menos dos ejecuciones consecutivas del scheduler en su horario normal, sin activación manual, con resultados verificables y actualización conforme a ALFA-02. Se comprueba una recuperación ante fallo transitorio controlado.
- [ ] Al menos una predicción real guardada antes del inicio llega a evaluación tras finalizar el partido. Se conserva evidencia de las fechas y del resultado; los fixtures simulados no sustituyen esta comprobación.
- [ ] Se registra un backtest del modelo publicado con commit, fecha, muestra, periodo, competiciones, exclusiones y métricas frente a baselines. No se exige superar un porcentaje arbitrario para el alfa, pero tampoco se afirma una precisión sin evidencia reproducible.
- [ ] Se reinician API y worker y se confirma persistencia de datos y continuidad de schedules. La comprobación operativa detecta pérdida de acceso a PostgreSQL/Redis y sincronización vencida, sin depender solo de `/health` al arrancar.
- [ ] Se documentan URL, configuración sin secretos, responsable de operación, cómo detectar fallos y cómo recuperar el servicio. Existe una copia de seguridad y se verifica su restauración en una base aislada.
- [ ] `CHANGELOG.md` describe `0.1.0-alpha.1` y sus limitaciones. El registro de evidencia identifica el commit candidato; no se publica ni se etiqueta una versión automáticamente por completar este documento.

**Evidencia mínima:** CI del commit, resultados de integración, revisión en navegador, ejecuciones programadas, evaluación real, backtest y comprobación de restauración.

## Registro de avance y evidencia

Actualizar este registro al trabajar cada aspecto. Los enlaces al código deben apuntar al estado o commit comprobado; no basta con describir una intención. Guardar evidencia extensa en `docs/alpha-evidence/` cuando sea necesario, sin secretos ni payloads RAW completos.

| ID | Responsable | Commit o PR | Evidencia y fecha | Pendiente o bloqueo |
| --- | --- | --- | --- | --- |
| ALFA-01 | Codex | Rama `codex/alpha-prediction-provenance`, sobre `6a52e49` | [Evidencia local, 2026-11-03](./alpha-evidence/ALFA-01.md) | Cerrado localmente; despliegue se valida en ALFA-06 |
| ALFA-02 | Sin asignar | — | Sin evidencia de cierre | Actualización y selección previa al inicio |
| ALFA-03 | Sin asignar | — | Sin evidencia de cierre | Fallos, reintentos y vigencia |
| ALFA-04 | Sin asignar | — | Sin evidencia de cierre | Mensajes, fechas y revisión en navegador |
| ALFA-05 | Sin asignar | — | Sin evidencia de cierre | Configuración de producción y login |
| ALFA-06 | Sin asignar | — | Sin evidencia de cierre | Integración, despliegue y observación real |

Para retomar el trabajo: leer `AGENTS.md`, este mapa y las ADR aplicables; comprobar el estado real del código; seleccionar un aspecto respetando sus dependencias y registrar responsable y estado. Un cambio arquitectónico se justifica mediante ADR. Si falta acceso a infraestructura, registrar el bloqueo y continuar solo con criterios independientes; nunca marcar una comprobación externa como aprobada por inferencia.

## Condición final de salida

El candidato está **LISTO PARA ALFA** únicamente cuando ALFA-01 a ALFA-06 están terminados, sus evidencias corresponden al commit candidato y no quedan fallos conocidos de integridad de datos, acceso administrativo o uso del flujo principal. Una corrección posterior obliga a repetir las comprobaciones afectadas sobre el nuevo candidato.

Hasta entonces se mantiene **NO LISTA**, indicando los IDs pendientes. Completar este cierre acredita una versión preliminar dentro del alcance indicado; no acredita el MVP final ni una precisión futura garantizada del modelo.
