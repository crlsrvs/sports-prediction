# 1. Primeros pasos

## Requisitos

| Herramienta | Versión | Notas |
|---|---|---|
| Node.js | ≥ 20 | Se usa `node --env-file`, disponible desde Node 20.6. |
| npm | ≥ 10 | Viene con Node 20. El monorepo usa npm workspaces; no uses pnpm/yarn. |
| Docker + Docker Compose | cualquier versión reciente | Para PostgreSQL y Redis locales. |
| Git | — | |

Opcional: una clave gratuita de [API-Football](https://www.api-football.com/) para trabajar con datos reales. Sin ella la app funciona con datos de demostración.

## Instalación

```bash
git clone <url-del-repo> prediction
cd prediction
cp .env.example .env
docker compose up -d        # PostgreSQL en :5432 y Redis en :6379
npm install
```

Verifica que todo compila y pasa antes de tocar nada:

```bash
npm run typecheck
npm run lint
npm test
```

Si los tres comandos terminan con código 0, tu entorno está listo.

## Variables de entorno

El archivo `.env` vive en la raíz y **nunca se commitea** (está en `.gitignore`). Las apps lo cargan explícitamente con `--env-file=../../.env`; ni `tsx` ni Node lo leen solos.

| Variable | Default | Para qué sirve |
|---|---|---|
| `NODE_ENV` | `development` | |
| `DATABASE_URL` | `postgres://sports:sports@127.0.0.1:5432/sports_prediction` | Conexión a PostgreSQL. Si falta o la base no responde, la API cae a un store en memoria con datos de demo. |
| `DATABASE_MAX_POOL_SIZE` | `10` | Tamaño del pool de `pg`. |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Cola BullMQ. Necesario para encolar y ejecutar jobs. |
| `PORT` | `3000` | Puerto de la API. |
| `API_FOOTBALL_KEY` | vacío | Clave de API-Football. Sin ella, la fuente aparece como `disabled` y los jobs de ingesta se marcan `skipped`. |
| `API_FOOTBALL_SEASON` | `2024` | Temporada por defecto para `import-season` cuando no se pasa una explícita. El plan gratuito solo permite 2022–2024. |

## Levantar el entorno de desarrollo

Son tres procesos. Ábrelos en tres terminales (o usa `npm run dev`, que los lanza todos con `--workspaces`):

```bash
npm run dev:api      # NestJS en http://localhost:3000, recarga con tsx watch
npm run dev:worker   # Worker BullMQ; procesa los jobs de la cola "sports-prediction"
npm run dev:web      # Vite en http://localhost:5173; proxy /api → http://127.0.0.1:3000
```

Al arrancar la API verás en consola `App store mode: postgres` o `App store mode: memory`. Si ves `memory` y esperabas Postgres, revisa que Docker esté arriba y que `DATABASE_URL` sea correcta.

Abre <http://localhost:5173>:

- `/` — Partidos de hoy.
- `/matches/:id` — Análisis de un partido.
- `/admin` — Panel administrativo.

## Pasar de datos demo a datos reales

Al arrancar por primera vez verás un banner "Datos demo (seed)". Para trabajar con partidos reales:

1. Pon tu clave en `.env`: `API_FOOTBALL_KEY=...` y reinicia API y worker.
2. En Admin → Fuentes, pulsa **Probar** en "API-Football". Debe quedar `healthy`.
3. En Admin → Jobs en cola, escribe una temporada (2022, 2023 o 2024) y pulsa `import-season`. El worker descarga las 6 ligas de esa temporada (~2 000 partidos, 6 requests). Repite para las tres temporadas si quieres el dataset completo; espera ~1 minuto entre ellas porque el plan gratuito limita a 10 requests/minuto.
4. Pulsa **Regenerar todas (forzar)** para que todas las predicciones se calculen con el historial nuevo.
5. Vuelve al dashboard: el banner cambia a "live" y verás la última jornada disponible de cada liga.

> **Por qué no se ven partidos de hoy de verdad**: el plan gratuito de API-Football no expone la temporada en curso ni consultas por fecha fuera de una ventana de ~3 días. Por eso el dashboard muestra la jornada más reciente que tenemos cuando no hay partidos reales en la fecha actual. Esto está documentado en [03-datos-e-ingesta](./03-datos-e-ingesta.md#limitaciones-del-plan-gratuito).

## Comandos de referencia

| Propósito | Comando |
|---|---|
| Todo en modo dev | `npm run dev` |
| Solo API / worker / web | `npm run dev:api` · `npm run dev:worker` · `npm run dev:web` |
| Typecheck de todos los workspaces | `npm run typecheck` |
| Lint | `npm run lint` |
| Tests (todos) | `npm test` |
| Un archivo de test | `npx vitest run packages/prediction/src/footballV3.spec.ts` |
| Tests en modo watch | `npx vitest` |
| Build de producción | `npm run build` (o `--workspace=@sports-prediction/web`) |
| Limpiar `dist/` | `npm run clean` |
| Levantar / parar infraestructura | `docker compose up -d` · `docker compose down` |
| Borrar la base local y empezar de cero | `docker compose down -v` (borra volúmenes) |
| Consultar Postgres directamente | `docker exec -it prediction-postgres-1 psql -U sports -d sports_prediction` |

## Problemas frecuentes

**La API arranca en modo `memory` aunque Docker está corriendo.**
Comprueba `docker compose ps` (ambos servicios `healthy`) y que `DATABASE_URL` apunta a `127.0.0.1:5432`. La API hace `SELECT 1`, corre migraciones y siembra datos; cualquier fallo ahí la hace caer a memoria silenciosamente (es intencional para que la UI siempre funcione).

**"No se pudo encolar el job (¿Redis activo?)".**
Redis no responde. `docker compose up -d redis`.

**Encolo un job y no pasa nada.**
El worker no está corriendo (`npm run dev:worker`) o está conectado a otro Redis. Mira la consola del worker: imprime `Worker ready on queue "sports-prediction"`.

**`import-season` termina `skipped:missing-api-football-key`.**
La clave no está en `.env` o no reiniciaste el worker después de ponerla.

**API-Football devuelve errores de plan.**
El plan gratuito rechaza temporadas > 2024, los parámetros `last`/`next`, y `?date=` con `season`. El adapter ya contempla esto; si ves un error nuevo, revisa `packages/scraping/src/apiFootball.ts`.

**El typecheck falla con `exactOptionalPropertyTypes`.**
El `tsconfig.base.json` es estricto: no puedes pasar `undefined` explícito a una propiedad opcional. Construye el objeto condicionalmente (`cond ? { a, b } : { a }`).

**Cambié código en `packages/*` y la API no lo ve.**
Los paquetes se consumen desde `src/` vía `tsx`, así que sí debería recargar. Si no, reinicia `npm run dev:api`. Los paquetes no requieren build en desarrollo.

**Puertos ocupados.**
`lsof -i :3000` / `lsof -i :5173` y mata el proceso, o cambia `PORT` en `.env`.
