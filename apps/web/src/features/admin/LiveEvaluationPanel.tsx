import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api.js';
import styles from './BacktestPanel.module.css';
import { MetricsTables, num, pct } from './MetricsTables.js';

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('es-ES') : '—';
}

/**
 * Scorecard of predictions that were stored before kickoff and later resolved.
 * Unlike the backtest it never re-runs the model, so it reflects what users saw.
 */
export function LiveEvaluationPanel() {
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [includeBackfilled, setIncludeBackfilled] = useState(false);

  const models = useQuery({
    queryKey: ['admin', 'models'],
    queryFn: api.getModels,
  });
  const activeModel = selectedModel || models.data?.default || '';
  const summary = useQuery({
    queryKey: ['admin', 'evaluations', activeModel, includeBackfilled],
    queryFn: () =>
      api.getLiveEvaluation({ model: activeModel, liveOnly: !includeBackfilled }),
    enabled: activeModel !== '',
  });

  const data = summary.data;

  return (
    <section className={styles.panel}>
      <h2>Temporada en vivo</h2>
      <p className={styles.hint}>
        Predicciones guardadas antes del inicio del partido y evaluadas al conocerse el
        resultado. A diferencia del backtest, aquí no se vuelve a ejecutar el modelo: es
        lo que vieron los usuarios. Las evaluaciones las persiste el job
        <code> evaluate-predictions</code> (encadenado tras cada sincronización).
      </p>

      <div className={styles.controls}>
        <label>
          Modelo
          <select
            value={activeModel}
            onChange={(event) => setSelectedModel(event.target.value)}
          >
            {(models.data?.available ?? []).map((version) => (
              <option key={version} value={version}>
                {version}
                {version === models.data?.default ? ' (actual)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={includeBackfilled}
            onChange={(event) => setIncludeBackfilled(event.target.checked)}
          />{' '}
          Incluir predicciones generadas tras el partido
        </label>
        {summary.error ? (
          <span className={styles.error}>{summary.error.message}</span>
        ) : null}
      </div>

      {data ? (
        <>
          <table className={styles.table}>
            <caption>
              Desde {formatDate(data.since)} · partidos evaluados{' '}
              {formatDate(data.firstKickoffAt)} – {formatDate(data.lastKickoffAt)}
            </caption>
            <thead>
              <tr>
                <th>Partidos</th>
                <th>Ganador</th>
                <th>Marcador exacto</th>
                <th>MAE goles</th>
                <th>Brier</th>
                <th>Log loss</th>
                <th>RPS</th>
                <th>Excluidas (tras el partido)</th>
              </tr>
            </thead>
            <tbody>
              <tr className={styles.active}>
                <td>{data.samples}</td>
                <td>{pct(data.winnerRate)}</td>
                <td>{pct(data.exactScoreRate)}</td>
                <td>{num(data.maeGoals, 2)}</td>
                <td>{num(data.brierScore)}</td>
                <td>{num(data.logLoss)}</td>
                <td>{num(data.rps)}</td>
                <td>{data.backfilled}</td>
              </tr>
            </tbody>
          </table>
          {data.samples > 0 ? (
            <MetricsTables
              summary={{
                modelVersion: data.modelVersion,
                winnerRate: data.winnerRate,
                brierScore: data.brierScore,
                logLoss: data.logLoss,
                rps: data.rps,
                details: {
                  byCompetition: data.byCompetition,
                  bySeason: data.bySeason,
                  baselines: data.baselines,
                  calibration: data.calibration,
                },
              }}
            />
          ) : (
            <p className={styles.hint}>
              Todavía no hay predicciones hechas antes del partido con resultado
              conocido. Aparecerán tras la próxima jornada.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
