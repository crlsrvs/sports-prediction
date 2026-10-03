import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type BacktestRunDto } from '../../shared/api.js';
import styles from './BacktestPanel.module.css';

function pct(value: number | null | undefined): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null | undefined, digits = 3): string {
  return value == null ? '—' : value.toFixed(digits);
}

export function BacktestPanel() {
  const queryClient = useQueryClient();
  const [selectedModel, setSelectedModel] = useState<string>('');

  const models = useQuery({
    queryKey: ['admin', 'models'],
    queryFn: api.getModels,
  });
  const history = useQuery({
    queryKey: ['admin', 'backtests'],
    queryFn: api.getBacktestHistory,
  });

  const backtest = useMutation({
    mutationFn: (model: string) => api.runBacktest(model || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'backtests'] });
    },
  });

  const activeModel = selectedModel || models.data?.default || '';
  const latestByModel = new Map<string, BacktestRunDto>();
  for (const run of history.data ?? []) {
    if (!latestByModel.has(run.modelVersion)) latestByModel.set(run.modelVersion, run);
  }
  const current: BacktestRunDto | undefined =
    backtest.data ?? latestByModel.get(activeModel);

  return (
    <section className={styles.panel}>
      <h2>Evaluación de modelos</h2>
      <p className={styles.hint}>
        Backtest walk-forward: cada partido terminado se predice solo con datos
        anteriores a su inicio (corte 1h antes). Brier y log loss miden la calidad
        de las probabilidades 1X2 (menor es mejor); las líneas base indican si el
        modelo aporta señal real.
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
        <button
          type="button"
          onClick={() => backtest.mutate(activeModel)}
          disabled={backtest.isPending || !activeModel}
        >
          {backtest.isPending ? 'Ejecutando…' : 'Ejecutar backtesting'}
        </button>
        {backtest.error ? (
          <span className={styles.error}>{backtest.error.message}</span>
        ) : null}
      </div>

      {latestByModel.size > 0 ? (
        <table className={styles.table}>
          <caption>Última corrida por modelo</caption>
          <thead>
            <tr>
              <th>Modelo</th>
              <th>Partidos</th>
              <th>Ganador</th>
              <th>Marcador exacto</th>
              <th>MAE goles</th>
              <th>Brier</th>
              <th>Log loss</th>
            </tr>
          </thead>
          <tbody>
            {[...latestByModel.values()].map((run) => (
              <tr key={run.id} className={run.modelVersion === activeModel ? styles.active : undefined}>
                <td>{run.modelVersion}</td>
                <td>{run.samples}</td>
                <td>{pct(run.winnerRate)}</td>
                <td>{pct(run.exactScoreRate)}</td>
                <td>{num(run.maeGoals, 2)}</td>
                <td>{num(run.brierScore)}</td>
                <td>{num(run.logLoss)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {current ? (
        <div className={styles.details}>
          {current.details.baselines.length > 0 ? (
            <table className={styles.table}>
              <caption>Líneas base ({current.modelVersion})</caption>
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th>Ganador</th>
                  <th>Brier</th>
                  <th>Log loss</th>
                </tr>
              </thead>
              <tbody>
                <tr className={styles.active}>
                  <td>{current.modelVersion}</td>
                  <td>{pct(current.winnerRate)}</td>
                  <td>{num(current.brierScore)}</td>
                  <td>{num(current.logLoss)}</td>
                </tr>
                {current.details.baselines.map((baseline) => (
                  <tr key={baseline.label}>
                    <td>{baseline.label}</td>
                    <td>{pct(baseline.winnerRate)}</td>
                    <td>{num(baseline.brierScore)}</td>
                    <td>{num(baseline.logLoss)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {current.details.byCompetition.length > 0 ? (
            <table className={styles.table}>
              <caption>Por competición</caption>
              <thead>
                <tr>
                  <th>Competición</th>
                  <th>Partidos</th>
                  <th>Ganador</th>
                  <th>Exacto</th>
                  <th>Brier</th>
                </tr>
              </thead>
              <tbody>
                {current.details.byCompetition.map((item) => (
                  <tr key={item.competitionId}>
                    <td>{item.competitionName}</td>
                    <td>{item.samples}</td>
                    <td>{pct(item.winnerRate)}</td>
                    <td>{pct(item.exactScoreRate)}</td>
                    <td>{num(item.brierScore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {current.details.calibration.length > 0 ? (
            <table className={styles.table}>
              <caption>Calibración de la confianza</caption>
              <thead>
                <tr>
                  <th>Confianza</th>
                  <th>Partidos</th>
                  <th>Confianza media</th>
                  <th>Acierto real</th>
                </tr>
              </thead>
              <tbody>
                {current.details.calibration.map((bucket) => (
                  <tr key={bucket.rangeStart}>
                    <td>
                      {pct(bucket.rangeStart)} – {pct(bucket.rangeEnd)}
                    </td>
                    <td>{bucket.samples}</td>
                    <td>{pct(bucket.averageConfidence)}</td>
                    <td>{pct(bucket.observedAccuracy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : (
        <p className={styles.hint}>Aún no hay backtests guardados.</p>
      )}
    </section>
  );
}
