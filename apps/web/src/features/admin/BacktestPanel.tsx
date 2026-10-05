import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type BacktestRunDto } from '../../shared/api.js';
import styles from './BacktestPanel.module.css';
import { MetricsTables, num, pct } from './MetricsTables.js';

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
              <th>RPS</th>
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
                <td>{num(run.details.rps)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {current ? (
        <MetricsTables
          summary={{
            modelVersion: current.modelVersion,
            winnerRate: current.winnerRate,
            brierScore: current.brierScore,
            logLoss: current.logLoss,
            rps: current.details.rps,
            details: current.details,
          }}
        />
      ) : (
        <p className={styles.hint}>Aún no hay backtests guardados.</p>
      )}
    </section>
  );
}
