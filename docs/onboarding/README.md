# Guía de onboarding para desarrolladores

Esta guía está pensada para que una persona nueva en el equipo pueda, en su primer día, levantar el proyecto, entender cómo fluye un dato desde la fuente hasta la pantalla, y hacer su primer cambio con confianza.

Léela en orden la primera vez; después úsala como referencia.

| # | Documento | Qué responde |
|---|---|---|
| 1 | [Primeros pasos](./01-primeros-pasos.md) | ¿Cómo levanto todo en local? ¿Qué comandos uso? ¿Qué hago si algo falla? |
| 2 | [Arquitectura](./02-arquitectura.md) | ¿Cómo está organizado el monorepo? ¿Qué hace cada paquete? ¿Cuáles son los contratos entre capas? |
| 3 | [Datos e ingesta](./03-datos-e-ingesta.md) | ¿De dónde salen los partidos? ¿Qué es RAW, normalización, aliases? ¿Qué hace cada job? |
| 4 | [Motor de predicción](./04-motor-de-prediccion.md) | ¿Cómo se calcula una predicción? ¿Qué son v1/v2/v3, Poisson, Dixon-Coles? ¿Cómo se mide la calidad? |
| 5 | [API y frontend](./05-api-y-frontend.md) | ¿Qué endpoints existen? ¿Cómo está armado el frontend? ¿Qué muestra el Admin? |
| 6 | [Base de datos](./06-base-de-datos.md) | ¿Qué tablas hay? ¿Cómo agrego una migración? ¿Qué es `AppStore`? |
| 7 | [Flujo de trabajo](./07-flujo-de-trabajo.md) | ¿Cómo se trabaja aquí? Git, tests, convenciones, definición de hecho, recetas para tareas comunes. |
| 8 | [Glosario y FAQ](./08-glosario-y-faq.md) | Términos del dominio y de modelado, y preguntas frecuentes. |

## Otros documentos que debes conocer

- [`AGENTS.md`](../../AGENTS.md): reglas operativas del proyecto (stack permitido, convenciones, verificación). Aplican a humanos y a agentes de IA por igual. Es la fuente de verdad cuando algo aquí parezca contradecirlo.
- [`docs/PRD.md`](../PRD.md): el documento de producto. Define qué es el MVP, qué queda para V2 y por qué. Consúltalo antes de decidir qué se muestra al usuario final.
- [`docs/adr/`](../adr/): decisiones de arquitectura con su contexto. Antes de introducir una librería o cambiar una pieza estructural, revisa si hay un ADR y, si no, escribe uno.
- [`CHANGELOG.md`](../../CHANGELOG.md): historial de cambios en formato Keep a Changelog.

## Estado actual del proyecto (resumen de una página)

- **Producto**: dashboard de "Partidos de hoy", página de análisis por partido (marcador estimado, goles esperados, factores explicativos, comparación de equipos) y panel Admin interno. Idioma: español.
- **Deporte y competiciones visibles**: fútbol; UEFA Champions League, Premier League y La Liga.
- **Datos reales**: historial 2022/23–2024/25 desde API-Football (plan gratuito) y la temporada en curso (fixtures y resultados) desde football-data.org. Además de las tres ligas visibles, se ingieren Bundesliga, Serie A y Ligue 1 como *ligas de soporte*: alimentan el modelo pero no aparecen en el producto.
- **Modelo por defecto**: `football-v3` (Dixon-Coles). Se conservan `football-v1` y `football-v2` para comparar en backtesting.
- **Calidad medida** (backtest walk-forward sobre ~2 900 partidos reales): acierto de ganador 53.9 %, Brier 0.582, log loss 0.978, confianza calibrada (±4 puntos entre confianza declarada y acierto observado).
- **Fuera del MVP**: 1X2 visible al usuario final, cuotas de apuestas, cuentas de usuario, predicciones en vivo, explicaciones generadas por LLM.
