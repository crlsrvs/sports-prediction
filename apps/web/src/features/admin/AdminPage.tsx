import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api.js';
import styles from './AdminPage.module.css';
import { BacktestPanel } from './BacktestPanel.js';
import { LiveEvaluationPanel } from './LiveEvaluationPanel.js';

const ENQUEUEABLE_JOBS = [
  'discover-todays-matches',
  'scrape-source',
  'import-season',
  'generate-predictions',
  'evaluate-predictions',
  'source-health-check',
  'cleanup-raw-data',
] as const;

export function AdminPage() {
  const queryClient = useQueryClient();
  const [resolveMap, setResolveMap] = useState<Record<string, string>>({});
  const [lastJobMessage, setLastJobMessage] = useState<string | null>(null);
  const [lastTestDetail, setLastTestDetail] = useState<string | null>(null);
  const [importSeasonYear, setImportSeasonYear] = useState<string>('2024');
  const [lastEntityMessage, setLastEntityMessage] = useState<string | null>(null);
  const [mergeSource, setMergeSource] = useState<string>('');
  const [mergeTarget, setMergeTarget] = useState<string>('');

  const health = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: api.getAdminHealth,
  });
  const sources = useQuery({
    queryKey: ['admin', 'sources'],
    queryFn: api.getSources,
  });
  const jobs = useQuery({
    queryKey: ['admin', 'jobs'],
    queryFn: api.getJobs,
  });
  const unresolved = useQuery({
    queryKey: ['admin', 'unresolved'],
    queryFn: api.getUnresolved,
  });
  const predictions = useQuery({
    queryKey: ['admin', 'predictions'],
    queryFn: api.getPredictions,
  });
  const schedules = useQuery({
    queryKey: ['admin', 'schedules'],
    queryFn: api.getSchedules,
    refetchInterval: 60_000,
  });
  const teams = useQuery({
    queryKey: ['teams'],
    queryFn: api.getTeams,
  });

  const testSource = useMutation({
    mutationFn: api.testSource,
    onSuccess: async (result) => {
      setLastTestDetail(result.detail);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  const resolveEntity = useMutation({
    mutationFn: api.resolveEntity,
    onSuccess: async (result) => {
      setLastEntityMessage(
        result.mergedTeamId
          ? `Resuelto como ${result.team.canonicalName}; ${result.mergedTeamId} fusionado (${result.movedMatches} partidos movidos). Regenera las predicciones para reflejar el historial unificado.`
          : `Alias añadido a ${result.team.canonicalName}`,
      );
      await invalidateTeamData();
    },
    onError: (error: Error) => setLastEntityMessage(error.message),
  });

  const mergeTeams = useMutation({
    mutationFn: api.mergeTeams,
    onSuccess: async (result) => {
      setLastEntityMessage(
        `${result.mergedTeamId} fusionado en ${result.team.canonicalName} (${result.movedMatches} partidos movidos). Regenera las predicciones para reflejar el historial unificado.`,
      );
      setMergeSource('');
      setMergeTarget('');
      await invalidateTeamData();
    },
    onError: (error: Error) => setLastEntityMessage(error.message),
  });

  async function invalidateTeamData(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['admin'] });
    await queryClient.invalidateQueries({ queryKey: ['teams'] });
    await queryClient.invalidateQueries({ queryKey: ['matches'] });
  }

  const generate = useMutation({
    mutationFn: api.generatePredictions,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      await queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });

  const regenerate = useMutation({
    mutationFn: api.regeneratePredictions,
    onSuccess: async (result) => {
      setLastJobMessage(
        `Regeneradas ${result.regenerated} predicciones con ${result.modelVersion}`,
      );
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      await queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
    onError: (error: Error) => {
      setLastJobMessage(error.message);
    },
  });

  const enqueue = useMutation({
    mutationFn: api.enqueueJob,
    onSuccess: async (result) => {
      setLastJobMessage(`Encolado ${result.name} (${result.jobId})`);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error: Error) => {
      setLastJobMessage(error.message);
    },
  });

  return (
    <section className={styles.panel}>
      <Link to="/" className={styles.backLink}>
        ← Volver al dashboard
      </Link>
      <h1 className={styles.title}>Administración</h1>

      <div className={styles.stats}>
        <article>
          <strong>{health.data?.sources ?? '—'}</strong>
          <span>Fuentes</span>
        </article>
        <article>
          <strong>{health.data?.predictions ?? '—'}</strong>
          <span>Predicciones</span>
        </article>
        <article>
          <strong>{health.data?.unresolvedEntities ?? '—'}</strong>
          <span>Entidades pendientes</span>
        </article>
        <article>
          <strong>{health.data?.jobs ?? '—'}</strong>
          <span>Jobs</span>
        </article>
        <article>
          <strong>{health.data?.dataMode ?? '—'}</strong>
          <span>Modo datos</span>
        </article>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
        >
          Generar predicciones
        </button>
        <button
          type="button"
          onClick={() => regenerate.mutate({})}
          disabled={regenerate.isPending}
          title="Vuelve a generar las predicciones hechas con un modelo anterior"
        >
          {regenerate.isPending ? 'Regenerando…' : 'Regenerar con modelo actual'}
        </button>
        <button
          type="button"
          onClick={() => regenerate.mutate({ force: true })}
          disabled={regenerate.isPending}
          title="Regenera todas las predicciones aunque ya usen el modelo actual (útil tras importar historial nuevo)"
        >
          Regenerar todas (forzar)
        </button>
      </div>

      <h2>Jobs en cola</h2>
      <div className={styles.actions}>
        {ENQUEUEABLE_JOBS.map((name) =>
          name === 'import-season' ? (
            <span key={name} className={styles.jobWithInput}>
              <input
                type="number"
                min={2022}
                max={2024}
                value={importSeasonYear}
                onChange={(event) => setImportSeasonYear(event.target.value)}
                aria-label="Temporada a importar"
              />
              <button
                type="button"
                onClick={() =>
                  enqueue.mutate({
                    name,
                    season: Number(importSeasonYear),
                  })
                }
                disabled={enqueue.isPending || !importSeasonYear}
              >
                {name}
              </button>
            </span>
          ) : (
            <button
              key={name}
              type="button"
              onClick={() => enqueue.mutate({ name })}
              disabled={enqueue.isPending}
            >
              {name}
            </button>
          ),
        )}
      </div>
      {lastJobMessage ? <p className={styles.message}>{lastJobMessage}</p> : null}

      <h2>Programación</h2>
      {schedules.error ? (
        <p className={styles.message}>{schedules.error.message}</p>
      ) : (
        <ul className={styles.list}>
          {(schedules.data ?? []).map((schedule) => (
            <li key={schedule.id}>
              <div>
                <strong>
                  {schedule.name} · <code>{schedule.cron}</code> UTC
                </strong>
                <span>
                  {schedule.description}
                  {' · '}
                  {schedule.registered
                    ? `próxima: ${
                        schedule.nextRunAt
                          ? new Date(schedule.nextRunAt).toLocaleString('es-ES')
                          : '—'
                      }`
                    : 'no registrada (¿worker arrancado?)'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <LiveEvaluationPanel />

      <BacktestPanel />

      <h2>Fuentes</h2>
      {lastTestDetail ? (
        <p className={styles.message}>Última prueba: {lastTestDetail}</p>
      ) : null}
      <ul className={styles.list}>
        {(sources.data ?? []).map((source) => (
          <li key={source.id}>
            <div>
              <strong>{source.name}</strong>
              <span>
                {source.health} · fallos {source.consecutiveFailures}
              </span>
            </div>
            <button
              type="button"
              onClick={() => testSource.mutate(source.id)}
              disabled={testSource.isPending}
            >
              Probar
            </button>
          </li>
        ))}
      </ul>

      <h2>Entidades sin resolver</h2>
      {lastEntityMessage ? (
        <p className={styles.message}>{lastEntityMessage}</p>
      ) : null}
      <ul className={styles.list}>
        {(unresolved.data ?? []).length === 0 ? (
          <li className={styles.message}>No hay entidades pendientes</li>
        ) : (
          (unresolved.data ?? []).map((item) => {
            const selectedTeamId =
              resolveMap[item.id] ?? teams.data?.[0]?.id ?? '';
            return (
              <li key={item.id} className={styles.resolveRow}>
                <div>
                  <strong>{item.incomingName}</strong>
                  <span>
                    {item.sourceId}
                    {item.provisionalTeamId
                      ? ` · equipo provisional ${item.provisionalTeamId} (se fusionará)`
                      : ''}
                  </span>
                </div>
                <div className={styles.resolveControls}>
                  <select
                    value={selectedTeamId}
                    onChange={(event) =>
                      setResolveMap((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                  >
                    {(teams.data ?? []).map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.canonicalName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedTeamId || resolveEntity.isPending}
                    onClick={() =>
                      resolveEntity.mutate({
                        unresolvedId: item.id,
                        teamId: selectedTeamId,
                        alias: item.incomingName,
                      })
                    }
                  >
                    Resolver
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <h3>Fusionar equipos duplicados</h3>
      <p className={styles.message}>
        Mueve todos los partidos y alias del equipo origen al destino y borra el
        origen. Irreversible.
      </p>
      <div className={styles.resolveControls}>
        <select
          value={mergeSource}
          onChange={(event) => setMergeSource(event.target.value)}
          aria-label="Equipo origen (se borra)"
        >
          <option value="">Origen (se borra)…</option>
          {(teams.data ?? []).map((team) => (
            <option key={team.id} value={team.id}>
              {team.canonicalName} · {team.id}
            </option>
          ))}
        </select>
        <select
          value={mergeTarget}
          onChange={(event) => setMergeTarget(event.target.value)}
          aria-label="Equipo destino (se conserva)"
        >
          <option value="">Destino (se conserva)…</option>
          {(teams.data ?? []).map((team) => (
            <option key={team.id} value={team.id}>
              {team.canonicalName} · {team.id}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={
            !mergeSource ||
            !mergeTarget ||
            mergeSource === mergeTarget ||
            mergeTeams.isPending
          }
          onClick={() => {
            if (
              window.confirm(
                `¿Fusionar ${mergeSource} en ${mergeTarget}? El origen se borrará.`,
              )
            ) {
              mergeTeams.mutate({
                sourceTeamId: mergeSource,
                targetTeamId: mergeTarget,
              });
            }
          }}
        >
          {mergeTeams.isPending ? 'Fusionando…' : 'Fusionar'}
        </button>
      </div>

      <h2>Jobs recientes</h2>
      <ul className={styles.list}>
        {(jobs.data ?? []).slice(0, 8).map((job) => (
          <li key={job.id}>
            <div>
              <strong>{job.status}</strong>
              <span>
                {job.sourceId} · {job.recordsProcessed}/{job.recordsFound}
                {job.error ? ` · ${job.error}` : ''}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <h2>Predicciones</h2>
      <ul className={styles.list}>
        {(predictions.data ?? []).slice(0, 8).map((prediction) => (
          <li key={prediction.id}>
            <div>
              <strong>
                {prediction.predictedScore.home}-{prediction.predictedScore.away}
              </strong>
              <span>
                {prediction.matchId} · {prediction.confidence}% ·{' '}
                {prediction.modelVersion}
                {prediction.outcomeProbabilities
                  ? ` · 1X2 ${Math.round(prediction.outcomeProbabilities.home * 100)}/${Math.round(prediction.outcomeProbabilities.draw * 100)}/${Math.round(prediction.outcomeProbabilities.away * 100)}`
                  : ''}
              </span>
            </div>
            <Link to={`/matches/${prediction.matchId}`}>Ver</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
