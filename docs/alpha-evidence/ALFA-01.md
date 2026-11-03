# ALFA-01 — Evidencia de cierre local

Fecha: 2026-11-03. Responsable: Codex. Base: `6a52e49`. Implementación en la rama `codex/alpha-prediction-provenance`; el commit de cierre se identifica en su historial Git. Este registro no acredita un despliegue ni el cierre del resto del alfa.

## Implementación

- [ADR 0008](../adr/0008-prediction-input-snapshots.md) documenta el contrato de reproducción y la conservación de versiones del motor.
- [Migración 007](../../packages/database/migrations/007_prediction_input_snapshot.sql) agrega `input_snapshot` nullable, sin backfill ni eliminación de predicciones previas.
- El contexto completo se guarda en los dos caminos de generación de la API y en el worker: partido, competición, equipos, features, ratings y corte. El modelo y la generación siguen en la fila de la predicción.
- El análisis usa las features e identidades guardadas. Una corrección del historial o un cambio de nombre posterior no altera la comparación original.
- Los registros anteriores mantienen su salida y evaluación. La API devuelve features nulas y comparación vacía; la web explica la ausencia de datos originales y oculta sus gráficos/comparación. Las reconstrucciones posteriores al inicio se identifican explícitamente.
- El descanso y las bajas/alineaciones respetan el límite exclusivo de `dataCutoffAt`.
- La lectura PostgreSQL conserva los milisegundos. La prueba real detectó que convertir un `Date` a texto antes de reconstruirlo truncaba esa precisión; la conversión fue corregida.
- MemoryStore copia las predicciones al guardar y leer para que la mutación de referencias externas no cambie el cálculo conservado.

## Pruebas que constituyen la evidencia

| Criterio | Evidencia ejecutable |
| --- | --- |
| Corte temporal para todas las features históricas, incluido descanso | [buildFeatureSnapshot.spec.ts](../../packages/features/src/buildFeatureSnapshot.spec.ts): agregar resultados en el corte y después de él no cambia el snapshot completo |
| Corte exclusivo para bajas y alineaciones | [availability.spec.ts](../../packages/features/src/availability.spec.ts): hechos conocidos exactamente en el corte quedan excluidos |
| Features e identidades originales y repetición exacta del motor | [analysis.service.spec.ts](../../apps/api/src/analysis/analysis.service.spec.ts): modificar historial/nombre no modifica análisis; el motor reproduce la salida guardada |
| Legado sin datos inventados | Mismo test de servicio y [PredictionProvenance.spec.tsx](../../apps/web/src/features/analysis/PredictionProvenance.spec.tsx), que renderiza el componente real |
| Generación inicial y regeneración con snapshot | Test del servicio y [pipeline.spec.ts](../../apps/worker/src/pipeline.spec.ts) |
| Migración preserva legado, es repetible y restaura fechas JSON | [predictionPersistence.integration.spec.ts](../../apps/api/src/analysis/predictionPersistence.integration.spec.ts) sobre PostgreSQL real |
| Worker conserva entradas reproducibles en SQL | Test de integración de `pipeline.spec.ts` sobre PostgreSQL real |

El ejemplo reproducible es `match-bar-rma` del seed de tests: el test SQL crea las tablas anteriores a 007, inserta un registro legado, aplica las migraciones dos veces y genera una nueva predicción. La vuelve a leer desde JSONB, modifica después un resultado histórico y el nombre local, y verifica igualdad completa de features, comparación y salida del motor. Son datos simulados identificados como tales, no evidencia de precisión deportiva.

## Resultados

- Node local: `v24.22.1`; PostgreSQL: contenedor `postgres:16-alpine`, temporal y sin volúmenes del proyecto.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `TEST_DATABASE_URL=postgres://alpha_test:alpha_test@127.0.0.1:55437/alpha_test npm test`: exit 0, **118 tests en 36 archivos**, incluidas las tres comprobaciones SQL; ninguna omitida en esta ejecución.
- `npm run build`: exit 0. Persiste el aviso ya conocido de tamaño del bundle, fuera del cierre de ALFA-01.
- `git diff --check`: exit 0.

La URL anterior contiene exclusivamente credenciales desechables de prueba, no las del proyecto. Las suites crean esquemas con nombres aleatorios y los eliminan al terminar. Nunca leen `DATABASE_URL`; sin `TEST_DATABASE_URL`, solo se omiten las pruebas SQL. La configuración de CI incorpora PostgreSQL y esa variable para ejecutarlas automáticamente; la ejecución remota de CI debe comprobarse sobre el commit publicado y no se acredita mediante estos resultados locales.

## Repetición local

Usar una base PostgreSQL de pruebas cuyo usuario pueda crear y eliminar esquemas. Configurar únicamente `TEST_DATABASE_URL` para esta suite y ejecutar `npm test`. No apuntar a producción. Las pruebas de servicio, corte y renderizado no necesitan servicios externos.

## Límites y continuación

No se modificó ni migró la base de datos del proyecto. No se consumieron proveedores externos ni se desplegaron servicios. La migración deberá comprobarse en el candidato mediante ALFA-06. La actualización automática, conservación de versiones previas al inicio y selección para evaluación se mantienen pendientes en ALFA-02; no quedan resueltas por almacenar el snapshot.
