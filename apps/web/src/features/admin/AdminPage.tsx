import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api.js';
import styles from './AdminPage.module.css';

const ENQUEUEABLE_JOBS = [
  'discover-todays-matches',
  'scrape-source',
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  const backtest = useMutation({
    mutationFn: api.runBacktest,
  });

  const generate = useMutation({
    mutationFn: api.generatePredictions,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      await queryClient.invalidateQueries({ queryKey: ['matches'] });
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
          onClick={() => backtest.mutate()}
          disabled={backtest.isPending}
        >
          Ejecutar backtesting
        </button>
      </div>

      <h2>Jobs en cola</h2>
      <div className={styles.actions}>
        {ENQUEUEABLE_JOBS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => enqueue.mutate(name)}
            disabled={enqueue.isPending}
          >
            {name}
          </button>
        ))}
      </div>
      {lastJobMessage ? <p className={styles.message}>{lastJobMessage}</p> : null}

      {backtest.data ? (
        <p className={styles.message}>
          Backtest · samples {backtest.data.samples} · exact{' '}
          {(backtest.data.exactScoreRate * 100).toFixed(1)}% · winner{' '}
          {(backtest.data.winnerRate * 100).toFixed(1)}% · MAE{' '}
          {backtest.data.maeGoals.toFixed(2)}
        </p>
      ) : null}

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
                  <span>{item.sourceId}</span>
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
              </span>
            </div>
            <Link to={`/matches/${prediction.matchId}`}>Ver</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
