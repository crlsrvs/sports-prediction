# 9. CI y despliegue

Qué se ejecuta en cada PR, cómo se empaquetan la API y el worker, y cómo se despliega todo en los servicios del stack (Vercel, Neon, Upstash y un host de contenedores). La decisión y sus consecuencias están en [ADR 0004](../adr/0004-ci-and-deployment-topology.md).

## Integración continua

`.github/workflows/ci.yml` corre en cada `pull_request` y en cada push a `main`:

1. `npm ci` con Node de `.nvmrc` (22).
2. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` — exactamente el bucle de verificación de `AGENTS.md`. Si pasa en tu máquina, pasa en CI.
3. Construye las imágenes Docker de `api` y `worker` (sin publicarlas) para que un cambio en dependencias o en el `Dockerfile` no rompa el despliegue por sorpresa.

Ejecuciones concurrentes sobre la misma rama se cancelan entre sí. No hay despliegue automático desde CI: Vercel y Render se enganchan directamente al repositorio.

## Cómo se ejecutan la API y el worker en producción

Los paquetes se compilan a `dist/` y en producción corre Node, no `tsx` ([ADR 0005](../adr/0005-compiled-workspace-packages.md)):

```bash
npm start --workspace=@sports-prediction/api      # node dist/main.js
npm start --workspace=@sports-prediction/worker
```

`npm run dev` sigue en TypeScript (`--conditions=source`). `npm start` **no** lee `.env`; las variables las inyecta la plataforma. Hay que haber compilado antes (`npm run build`).

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

En producción Node ejecuta `dist/main.js`, sin `tsx` ni `--tsconfig`: el build ya compiló los decoradores de NestJS con `emitDecoratorMetadata`. En desarrollo la API sí pasa `--tsconfig tsconfig.json` a `tsx`.

## Variables de entorno en producción

| Variable | API | Worker | Notas |
|---|---|---|---|
| `DATABASE_URL` | sí | sí | Neon: la cadena que te da el panel termina en `?sslmode=require`. Déjalo así. |
| `DATABASE_MAX_POOL_SIZE` | 5 | 3 | Neon free limita conexiones; dos procesos con pools pequeños bastan. |
| `REDIS_URL` | sí | sí | Upstash: usa la URL `rediss://` (TLS). BullMQ ya va con `maxRetriesPerRequest: null`. |
| `STORE_ALLOW_MEMORY_FALLBACK` | `false` | `false` | Nunca `true` en producción. |
| `JOB_SCHEDULER_ENABLED` | — | `true` | Si algún día corres varios workers, solo uno debe tenerlo en `true`. |
| `ADMIN_PASSWORD` | sí | — | Contraseña del login de Admin. Preferida: no viaja al bundle. |
| `ADMIN_TOKEN` | opcional | — | Cabecera fija para scripts. Vacío junto con la contraseña = sin protección (solo local). |
| `API_FOOTBALL_KEY`, `FOOTBALL_DATA_KEY` | sí | sí | La API las usa para "Probar fuente"; el worker para sincronizar. |
| `API_FOOTBALL_SEASON` | — | `2024` | Solo para `import-season` manual. |
| `PORT` | `3000` | — | Render lo fija él; el Dockerfile expone 3000. |
| `ALLOWED_ORIGINS` | origen del frontend | — | Lista separada por comas, sin rutas ni barra final. Configúrala manualmente en el servicio API de Render: el Blueprint no la declara. Sin ella solo se permiten orígenes locales. |

Frontend (Vercel, variables de build):

| Variable | Valor |
|---|---|
| `VITE_API_URL` | Origen de la API, p. ej. `https://sports-prediction-api.onrender.com`. Sin ella el bundle llama a `/api` (solo funciona con el proxy de Vite en desarrollo). |
| `VITE_ADMIN_TOKEN` | Solo si el despliegue usa `ADMIN_TOKEN` y no hay formulario. Con `ADMIN_PASSWORD` déjalo vacío: el navegador pide la contraseña y guarda la sesión. |

Al ser variables `VITE_*` quedan dentro del bundle: cualquiera que abra `/admin` puede leer el token. Sirve para que el admin no sea un endpoint anónimo abierto a internet, no como autenticación real (V2).

## Paso a paso del primer despliegue

Orden recomendado: datos → API y worker → frontend. Cada paso necesita el anterior.

### 1. Neon (PostgreSQL)

1. Crea un proyecto y copia la connection string (con `sslmode=require`).
2. No hace falta crear tablas: `PostgresStore.migrate()` aplica `packages/database/migrations/*.sql` al arrancar la API y el worker. La primera vez, arranca la API sola y espera a ver `/health` con `"store":"postgres"` antes de encender el worker (las migraciones son idempotentes pero no están serializadas con un lock).
3. Para no empezar de cero, puedes volcar tu base local: `docker exec prediction-postgres-1 pg_dump -U sports -d sports_prediction --no-owner | psql "<NEON_URL>"`. Así te llevas el historial 2022–2024, los aliases resueltos y las predicciones.

### 2. Upstash (Redis)

1. Crea una base Redis (región cercana al host de la API) y copia la URL `rediss://`.
2. El plan gratuito limita comandos/día. BullMQ con un worker ocioso consume pocos; el scheduler cada 6 h es asumible. Si ves el contador subir sin jobs, revisa que no haya dos workers compitiendo.

### 3. Render (API y worker)

1. "New → Blueprint", apunta al repo; Render lee `render.yaml` y crea `sports-prediction-api` (web, free) y `sports-prediction-worker` (worker, starter: Render no tiene workers gratuitos).
2. Rellena las variables marcadas `sync: false` (`DATABASE_URL`, `REDIS_URL`, claves y `ADMIN_PASSWORD`; genera la contraseña con `openssl rand -hex 24`).
3. Comprueba `https://<api>.onrender.com/health` → `{"status":"ok","store":"postgres"}` y `GET /admin/schedules` con la cabecera `x-admin-token` → dos schedules `registered: true` una vez arrancado el worker.
4. El servicio web gratuito se duerme tras 15 min sin tráfico; la primera petición tarda ~30 s. El worker no se duerme, así que las sincronizaciones y predicciones siguen ocurriendo aunque nadie entre a la web.

Si prefieres otro host (Fly.io, Railway, una VM), la imagen es la misma: un contenedor por app, variables de entorno, `/health` como chequeo.

### 4. Vercel (frontend)

1. "Add New Project", importa el repo y pon **Root Directory = `apps/web`**. `apps/web/vercel.json` ya indica instalar y construir desde la raíz del monorepo y reescribir rutas a `index.html` (SPA).
2. Variable: `VITE_API_URL`. No hace falta `VITE_ADMIN_TOKEN` si la API tiene `ADMIN_PASSWORD`.
3. Configura `ALLOWED_ORIGINS=https://<frontend>.vercel.app` en la API y reinicia o redespliega el servicio. Si usas un dominio propio o previews, añade los orígenes exactos separados por comas. `*` abre el acceso CORS y no es compatible con peticiones de navegador en modo de credenciales; usa una lista explícita para producción.

### 5. Comprobación final

- Dashboard muestra la próxima jornada con predicciones.
- Admin → Programación lista los dos schedules con `nextRunAt`.
- Admin → Fuentes → "Probar" en football-data.org responde `ok`.
- Tras la primera sincronización programada, `scraping_jobs` tiene una fila `success` de `football-data` y "Temporada en vivo" empieza a contar partidos cuando se juega la siguiente jornada.

## Problemas típicos

**El frontend funciona localmente pero el navegador bloquea la API en producción.** Revisa `VITE_API_URL` y `ALLOWED_ORIGINS`. El origen del frontend (protocolo, dominio y puerto, sin ruta) debe figurar en la lista de la API. Un `curl` exitoso no comprueba CORS.

**`/health` responde pero `store` es `memory`.** `DATABASE_URL` vacía en esa plataforma. Con `STORE_ALLOW_MEMORY_FALLBACK=false` y URL inválida el proceso no arranca, así que si ves `memory` es porque la variable no llegó.

**401 en todo el Admin.** La sesión caducó (12 h) o la contraseña cambió. Vuelve a entrar. Si el despliegue viejo usaba `VITE_ADMIN_TOKEN`, ese valor tiene que seguir coincidiendo con `ADMIN_TOKEN`.

**`Cannot find module` al hacer `npm start`.** Falta `dist/`. Corre `npm run build`. `npm run dev` no lo necesita.

**Render reinicia el worker en bucle.** Mira los logs: casi siempre `StoreConnectionError` (URL de Neon sin `sslmode=require` o proyecto suspendido) o `ECONNREFUSED` a Redis (URL `redis://` en lugar de `rediss://`).

**El scheduler no aparece registrado.** El worker aún no arrancó o tiene `JOB_SCHEDULER_ENABLED=false`. La API solo lee lo que el worker escribió en Redis.
