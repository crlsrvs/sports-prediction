# 1. Primeros pasos

## Requisitos

| Herramienta | Versión | Notas |
|---|---|---|
| Node.js | ≥ 20 | Se usa `node --env-file`, disponible desde Node 20.6. |
| npm | ≥ 10 | Viene con Node 20. El monorepo usa npm workspaces; no uses pnpm/yarn. |
| Docker + Docker Compose | cualquier versión reciente | Para PostgreSQL y Redis locales. |
| Git | — | |

Opcional, para datos reales: una clave gratuita de [football-data.org](https://www.football-data.org/) (temporada en curso) y otra de [API-Football](https://www.api-football.com/) (historial 2022–2024). Sin ellas la app funciona con datos de demostración.

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
| `DATABASE_URL` | `postgres://sports:sports@127.0.0.1:5432/sports_prediction` | Conexión a PostgreSQL. Si está **vacía**, la API usa un store en memoria con datos de demo (modo demo explícito). Si está definida pero la base no responde, la API **no arranca**. |
| `DATABASE_MAX_POOL_SIZE` | `10` | Tamaño del pool de `pg`. |
| `STORE_ALLOW_MEMORY_FALLBACK` | `false` | Solo para demos: si `true`, cuando Postgres no responde se cae a memoria con un aviso en vez de fallar. Nunca en producción. |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Cola BullMQ. Necesario para encolar y ejecutar jobs. |
| `PORT` | `3000` | Puerto de la API. |
| `API_FOOTBALL_KEY` | vacío | Clave de API-Football. Sin ella, la fuente aparece como `disabled` y los jobs de ingesta se marcan `skipped`. |
| `API_FOOTBALL_SEASON` | `2024` | Temporada por defecto para `import-season` cuando no se pasa una explícita. El plan gratuito solo permite 2022–2024. |
| `FOOTBALL_DATA_KEY` | vacío | Token de football-data.org. Con él, `scrape-source` sincroniza la temporada en curso (fixtures y resultados). Sin él, la fuente aparece `disabled`. |
| `ADMIN_PASSWORD` | vacío | Contraseña del formulario de Admin. La API devuelve una sesión de 12 h; la contraseña no entra en el bundle. Vacío en local. |
| `ADMIN_TOKEN` | vacío | Alternativa para scripts: cabecera `x-admin-token` con este valor. Si las dos están vacías, `/admin/*` queda abierto. |
| `JOB_SCHEDULER_ENABLED` | `true` | Si el worker registra las ejecuciones periódicas (`JOB_SCHEDULES`: sincronizar + predecir cada 6 h, limpiar RAW semanal). Ponlo en `false` si no quieres gastar cuota de API desde tu máquina. |

## Levantar el entorno de desarrollo

Son tres procesos. Ábrelos en tres terminales (o usa `npm run dev`, que los lanza todos con `--workspaces`):

```bash
npm run dev:api      # NestJS en http://localhost:3000, recarga con tsx watch
npm run dev:worker   # Worker BullMQ; procesa los jobs de la cola "sports-prediction"
npm run dev:web      # Vite en http://localhost:5173; proxy /api → http://127.0.0.1:3000
```

Al arrancar la API verás en consola `App store mode: postgres` o `App store mode: memory` (este último solo si `DATABASE_URL` está vacía o permitiste el fallback). `GET /health` también lo expone: `{ "status": "ok", "store": "postgres", "storeReason": null }`.

Abre <http://localhost:5173>:

- `/` — Partidos de hoy.
- `/matches/:id` — Análisis de un partido.
- `/admin` — Panel administrativo.

## Pasar de datos demo a datos reales

Al arrancar por primera vez verás un banner "Datos demo (seed)". Para trabajar con partidos reales:

1. Pon tus claves en `.env` (`API_FOOTBALL_KEY=...`, `FOOTBALL_DATA_KEY=...`) y reinicia API y worker.
2. En Admin → Fuentes, pulsa **Probar** en cada fuente. Deben quedar `healthy`.
3. **Historial** (API-Football): en Admin → Jobs en cola, escribe una temporada (2022, 2023 o 2024) y pulsa `import-season`. El worker descarga las 6 ligas de esa temporada (~2 000 partidos, 6 requests). Repite para las tres; espera ~1 minuto entre ellas (10 requests/minuto).
4. **Temporada en curso** (football-data.org): pulsa `scrape-source`. Trae programados y resultados de las 6 competiciones (~1 900 partidos, 6 requests). Es el job que conviene repetir a diario.
5. Admin → Entidades sin resolver: los clubes que el ingest no pudo casar (ascendidos nuevos o variantes de nombre como `Brighton & Hove Albion FC`). Resuelve los que sean duplicados; los nuevos de verdad puedes dejarlos.
6. Pulsa **Regenerar todas (forzar)** para que las predicciones usen el historial completo, o `generate-predictions` para los partidos de los próximos 10 días.
7. Vuelve al dashboard: el banner cambia a "live" y verás los partidos de hoy o, si no hay, la próxima jornada.

> Sin `FOOTBALL_DATA_KEY` solo tendrás historial: el dashboard mostrará la jornada más reciente de 2024/25. Ver [03-datos-e-ingesta](./03-datos-e-ingesta.md#limitaciones-del-plan-gratuito).

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

**La API no arranca: `StoreConnectionError: PostgreSQL unavailable (...)`.**
Es el comportamiento esperado cuando `DATABASE_URL` está definida pero la base no responde. Comprueba `docker compose ps` (ambos servicios `healthy`) y que `DATABASE_URL` apunta a `127.0.0.1:5432`. El mensaje incluye la causa (`ECONNREFUSED`, autenticación, etc.). Si solo quieres ver la UI sin base, vacía `DATABASE_URL` o pon `STORE_ALLOW_MEMORY_FALLBACK=true`.

**La API arranca en modo `memory` y yo esperaba Postgres.**
Entonces `DATABASE_URL` está vacía en tu `.env`, o tienes `STORE_ALLOW_MEMORY_FALLBACK=true` y la base falló (mira el `WARN` al arrancar o `storeReason` en `/health`).

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
