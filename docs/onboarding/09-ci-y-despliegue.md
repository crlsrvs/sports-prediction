# 9. CI y despliegue

Qué se ejecuta en cada PR, cómo se empaquetan la API y el worker, y cómo se despliega todo en los servicios del stack (Vercel, Neon, Upstash y un host de contenedores). La decisión y sus consecuencias están en [ADR 0004](../adr/0004-ci-and-deployment-topology.md).

## Integración continua

`.github/workflows/ci.yml` corre en cada `pull_request` y en cada push a `main`:

1. `npm ci` con Node de `.nvmrc` (22).
2. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` — exactamente el bucle de verificación de `AGENTS.md`. Si pasa en tu máquina, pasa en CI.
3. Construye las imágenes Docker de `api` y `worker` (sin publicarlas) para que un cambio en dependencias o en el `Dockerfile` no rompa el despliegue por sorpresa.

Ejecuciones concurrentes sobre la misma rama se cancelan entre sí. No hay despliegue automático desde CI: Vercel y Render se enganchan directamente al repositorio.

## Cómo se ejecutan la API y el worker en producción

Los paquetes del monorepo se consumen desde `src/` (no hay `dist/` publicado), así que en producción también corre TypeScript con `tsx`:

```bash
npm start --workspace=@sports-prediction/api      # tsx --tsconfig tsconfig.json src/main.ts
npm start --workspace=@sports-prediction/worker
```

`npm start` **no** lee `.env` (eso solo lo hace `npm run dev`); las variables las inyecta la plataforma.

El `Dockerfile` de la raíz construye una imagen para cualquiera de las dos apps:

```bash
docker build --build-arg APP=api -t sports-prediction-api .
docker build --build-arg APP=worker -t sports-prediction-worker .

# Prueba local contra el Postgres/Redis de docker-compose
docker run --rm -p 3100:3000 \
  -e DATABASE_URL=postgres://sports:sports@host.docker.internal:5432/sports_prediction \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  sports-prediction-api
curl localhost:3100/health
```

El `--tsconfig` en el comando no es decorativo: NestJS usa decoradores con `emitDecoratorMetadata`, y sin ese tsconfig `tsx` falla al transformar los controladores.

## Variables de entorno en producción

| Variable | API | Worker | Notas |
|---|---|---|---|
| `DATABASE_URL` | sí | sí | Neon: la cadena que te da el panel termina en `?sslmode=require`. Déjalo así. |
| `DATABASE_MAX_POOL_SIZE` | 5 | 3 | Neon free limita conexiones; dos procesos con pools pequeños bastan. |
| `REDIS_URL` | sí | sí | Upstash: usa la URL `rediss://` (TLS). BullMQ ya va con `maxRetriesPerRequest: null`. |
| `STORE_ALLOW_MEMORY_FALLBACK` | `false` | `false` | Nunca `true` en producción. |
| `JOB_SCHEDULER_ENABLED` | — | `true` | Si algún día corres varios workers, solo uno debe tenerlo en `true`. |
| `ADMIN_TOKEN` | sí | — | Secreto compartido para `/admin/*`. Vacío = sin protección (solo local). |
| `API_FOOTBALL_KEY`, `FOOTBALL_DATA_KEY` | sí | sí | La API las usa para "Probar fuente"; el worker para sincronizar. |
| `API_FOOTBALL_SEASON` | — | `2024` | Solo para `import-season` manual. |
| `PORT` | `3000` | — | Render lo fija él; el Dockerfile expone 3000. |

Frontend (Vercel, variables de build):

| Variable | Valor |
|---|---|
| `VITE_API_URL` | Origen de la API, p. ej. `https://sports-prediction-api.onrender.com`. Sin ella el bundle llama a `/api` (solo funciona con el proxy de Vite en desarrollo). |
| `VITE_ADMIN_TOKEN` | El mismo valor que `ADMIN_TOKEN` en la API. Se envía como cabecera `x-admin-token` en `/admin/*`. |

Al ser variables `VITE_*` quedan dentro del bundle: cualquiera que abra `/admin` puede leer el token. Sirve para que el admin no sea un endpoint anónimo abierto a internet, no como autenticación real (V2).

## Paso a paso del primer despliegue

Orden recomendado: datos → API y worker → frontend. Cada paso necesita el anterior.

### 1. Neon (PostgreSQL)

1. Crea un proyecto y copia la connection string (con `sslmode=require`).
2. No hace falta crear tablas: `PostgresStore.migrate()` aplica `packages/database/src/migrations/*.sql` al arrancar la API y el worker. La primera vez, arranca la API sola y espera a ver `/health` con `"store":"postgres"` antes de encender el worker (las migraciones son idempotentes pero no están serializadas con un lock).
3. Para no empezar de cero, puedes volcar tu base local: `docker exec prediction-postgres-1 pg_dump -U sports -d sports_prediction --no-owner | psql "<NEON_URL>"`. Así te llevas el historial 2022–2024, los aliases resueltos y las predicciones.

### 2. Upstash (Redis)

1. Crea una base Redis (región cercana al host de la API) y copia la URL `rediss://`.
2. El plan gratuito limita comandos/día. BullMQ con un worker ocioso consume pocos; el scheduler cada 6 h es asumible. Si ves el contador subir sin jobs, revisa que no haya dos workers compitiendo.

### 3. Render (API y worker)

1. "New → Blueprint", apunta al repo; Render lee `render.yaml` y crea `sports-prediction-api` (web, free) y `sports-prediction-worker` (worker, starter: Render no tiene workers gratuitos).
2. Rellena las variables marcadas `sync: false` (`DATABASE_URL`, `REDIS_URL`, claves y `ADMIN_TOKEN`; genera el token con `openssl rand -hex 24`).
3. Comprueba `https://<api>.onrender.com/health` → `{"status":"ok","store":"postgres"}` y `GET /admin/schedules` con la cabecera `x-admin-token` → dos schedules `registered: true` una vez arrancado el worker.
4. El servicio web gratuito se duerme tras 15 min sin tráfico; la primera petición tarda ~30 s. El worker no se duerme, así que las sincronizaciones y predicciones siguen ocurriendo aunque nadie entre a la web.

Si prefieres otro host (Fly.io, Railway, una VM), la imagen es la misma: un contenedor por app, variables de entorno, `/health` como chequeo.

### 4. Vercel (frontend)

1. "Add New Project", importa el repo y pon **Root Directory = `apps/web`**. `apps/web/vercel.json` ya indica instalar y construir desde la raíz del monorepo y reescribir rutas a `index.html` (SPA).
2. Variables: `VITE_API_URL` y `VITE_ADMIN_TOKEN`.
3. CORS: la API acepta cualquier origen (`origin: true`), así que no hay nada que configurar. Si en el futuro se restringe, el dominio de Vercel debe estar en la lista.

### 5. Comprobación final

- Dashboard muestra la próxima jornada con predicciones.
- Admin → Programación lista los dos schedules con `nextRunAt`.
- Admin → Fuentes → "Probar" en football-data.org responde `ok`.
- Tras la primera sincronización programada, `scraping_jobs` tiene una fila `success` de `football-data` y "Temporada en vivo" empieza a contar partidos cuando se juega la siguiente jornada.

## Problemas típicos

**`/health` responde pero `store` es `memory`.** `DATABASE_URL` vacía en esa plataforma. Con `STORE_ALLOW_MEMORY_FALLBACK=false` y URL inválida el proceso no arranca, así que si ves `memory` es porque la variable no llegó.

**401 en todo el Admin.** `VITE_ADMIN_TOKEN` no coincide con `ADMIN_TOKEN` o se cambió sin redeploy del frontend (las `VITE_*` se fijan en build).

**`TransformError: Parameter decorators only work when experimental decorators are enabled`.** Se lanzó `tsx` sin `--tsconfig apps/api/tsconfig.json`. Usa `npm start` o el comando del Dockerfile.

**Render reinicia el worker en bucle.** Mira los logs: casi siempre `StoreConnectionError` (URL de Neon sin `sslmode=require` o proyecto suspendido) o `ECONNREFUSED` a Redis (URL `redis://` en lugar de `rediss://`).

**El scheduler no aparece registrado.** El worker aún no arrancó o tiene `JOB_SCHEDULER_ENABLED=false`. La API solo lee lo que el worker escribió en Redis.
