import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api.js';
import styles from './AdminPage.module.css';

export function AdminPage() {
  const queryClient = useQueryClient();

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

  const testSource = useMutation({
    mutationFn: api.testSource,
    onSuccess: async () => {
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

      {backtest.data ? (
        <p className={styles.message}>
          Backtest · samples {backtest.data.samples} · exact{' '}
          {(backtest.data.exactScoreRate * 100).toFixed(1)}% · winner{' '}
          {(backtest.data.winnerRate * 100).toFixed(1)}% · MAE{' '}
          {backtest.data.maeGoals.toFixed(2)}
        </p>
      ) : null}

      <h2>Fuentes</h2>
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
          (unresolved.data ?? []).map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.incomingName}</strong>
                <span>{item.sourceId}</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  resolveEntity.mutate({
                    unresolvedId: item.id,
                    teamId: 'team-man-city',
                    alias: item.incomingName,
                  })
                }
              >
                Resolver → Manchester City
              </button>
            </li>
          ))
        )}
      </ul>

      <h2>Jobs recientes</h2>
      <ul className={styles.list}>
        {(jobs.data ?? []).slice(0, 5).map((job) => (
          <li key={job.id}>
            <div>
              <strong>{job.status}</strong>
              <span>
                {job.sourceId} · {job.recordsProcessed}/{job.recordsFound}
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
