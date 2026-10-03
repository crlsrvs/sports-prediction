import type {
  BacktestBaselineDto,
  BacktestCalibrationDto,
  BacktestCompetitionDto,
} from '../../shared/api.js';
import styles from './BacktestPanel.module.css';

export function pct(value: number | null | undefined): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`;
}

export function num(value: number | null | undefined, digits = 3): string {
  return value == null ? '—' : value.toFixed(digits);
}

export interface MetricsSummary {
  readonly modelVersion: string;
  readonly winnerRate: number;
  readonly brierScore: number | null;
  readonly logLoss: number | null;
  readonly details: {
    readonly byCompetition: readonly BacktestCompetitionDto[];
    readonly baselines: readonly BacktestBaselineDto[];
    readonly calibration: readonly BacktestCalibrationDto[];
  };
}

/** Baselines, per-competition and calibration tables shared by backtest and live panels. */
export function MetricsTables({ summary }: { readonly summary: MetricsSummary }) {
  return (
    <div className={styles.details}>
      {summary.details.baselines.length > 0 ? (
        <table className={styles.table}>
          <caption>Líneas base ({summary.modelVersion})</caption>
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
              <td>{summary.modelVersion}</td>
              <td>{pct(summary.winnerRate)}</td>
              <td>{num(summary.brierScore)}</td>
              <td>{num(summary.logLoss)}</td>
            </tr>
            {summary.details.baselines.map((baseline) => (
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

      {summary.details.byCompetition.length > 0 ? (
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
            {summary.details.byCompetition.map((item) => (
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

      {summary.details.calibration.length > 0 ? (
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
            {summary.details.calibration.map((bucket) => (
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
  );
}
