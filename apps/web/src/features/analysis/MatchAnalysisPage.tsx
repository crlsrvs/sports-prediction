import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../shared/api.js';
import { formatForm, formatKickoff, metricWidth } from '../../shared/format.js';
import styles from './MatchAnalysisPage.module.css';

export function MatchAnalysisPage() {
  const params = useParams();
  const matchId = params['id'] ?? '';

  const query = useQuery({
    queryKey: ['matches', matchId, 'analysis'],
    queryFn: () => api.getMatchAnalysis(matchId),
    enabled: Boolean(matchId),
  });

  if (query.isPending) {
    return <p className={styles.message}>Generando análisis…</p>;
  }

  if (query.isError || !query.data) {
    return (
      <section className={styles.panel}>
        <p className={styles.message}>No se pudo cargar el análisis del partido.</p>
        <Link to="/" className={styles.backLink}>
          Volver
        </Link>
      </section>
    );
  }

  const analysis = query.data;
  const chartData = analysis.comparison.map((metric) => ({
    label: metric.label,
    local: Number(metric.homeValue.toFixed(2)),
    visitante: Number(metric.awayValue.toFixed(2)),
  }));

  return (
    <section className={styles.panel}>
      <Link to="/" className={styles.backLink}>
        ← Partidos de hoy
      </Link>

      <header className={styles.header}>
        <p className={styles.competition}>{analysis.competition.name}</p>
        <h1 className={styles.title}>
          {analysis.homeTeam.canonicalName} vs {analysis.awayTeam.canonicalName}
        </h1>
        <p className={styles.meta}>
          {formatKickoff(analysis.match.scheduledAt)} · Estado:{' '}
          {analysis.match.status}
        </p>
      </header>

      {analysis.prediction ? (
        <div className={styles.scoreBlock}>
          <p className={styles.scoreLabel}>Marcador estimado</p>
          <p className={styles.score}>
            {analysis.homeTeam.canonicalName}{' '}
            {analysis.prediction.predictedScore.home} -{' '}
            {analysis.prediction.predictedScore.away}{' '}
            {analysis.awayTeam.canonicalName}
          </p>
          <p className={styles.meta}>
            Confiabilidad {analysis.prediction.confidence}% · Modelo{' '}
            {analysis.prediction.modelVersion}
          </p>
          <p className={styles.meta}>
            xG {analysis.prediction.expectedGoals.home.toFixed(2)} -{' '}
            {analysis.prediction.expectedGoals.away.toFixed(2)}
          </p>
        </div>
      ) : (
        <p className={styles.message}>
          {analysis.unavailableReason ?? 'Análisis parcialmente disponible'}
        </p>
      )}

      <div className={styles.grid}>
        <div>
          <h2>Análisis</h2>
          <p>
            {analysis.homeTeam.canonicalName}
            <br />
            Forma: {formatForm(analysis.featureSnapshot?.homeForm ?? [])}
          </p>
          <p>
            {analysis.awayTeam.canonicalName}
            <br />
            Forma: {formatForm(analysis.featureSnapshot?.awayForm ?? [])}
          </p>
        </div>

        <div>
          <h2>Comparación</h2>
          <div className={styles.bars}>
            {analysis.comparison.map((metric) => {
              const max = Math.max(metric.homeValue, metric.awayValue, 0.1);
              return (
                <div key={metric.label} className={styles.barRow}>
                  <span>{metric.label}</span>
                  <div className={styles.barTrack}>
                    <span
                      className={styles.barHome}
                      style={{ width: metricWidth(metric.homeValue, max) }}
                    />
                    <span
                      className={styles.barAway}
                      style={{ width: metricWidth(metric.awayValue, max) }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.chartWrap}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="label" stroke="#b7c5d6" />
            <YAxis stroke="#b7c5d6" />
            <Tooltip />
            <Legend />
            <Bar dataKey="local" fill="#3dd6c6" name={analysis.homeTeam.canonicalName} />
            <Bar
              dataKey="visitante"
              fill="#7aa2ff"
              name={analysis.awayTeam.canonicalName}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h2>Factores principales</h2>
        <ul className={styles.factors}>
          {(analysis.prediction?.factors ?? []).map((factor) => (
            <li key={`${factor.feature}-${factor.explanation}`}>
              {factor.direction === 'negative' ? '-' : '+'} {factor.explanation}
            </li>
          ))}
        </ul>
      </div>

      {analysis.evaluation ? (
        <div className={styles.evaluation}>
          <h2>Predicción vs resultado</h2>
          <p>
            Predicho: {analysis.evaluation.predictedHome}-
            {analysis.evaluation.predictedAway}
          </p>
          <p>
            Real: {analysis.evaluation.actualHome}-{analysis.evaluation.actualAway}
          </p>
          <p>
            Marcador exacto: {analysis.evaluation.exactScore ? 'Sí' : 'No'} ·
            Ganador implícito:{' '}
            {analysis.evaluation.winnerImpliedMatch ? 'Sí' : 'No'}
          </p>
        </div>
      ) : null}
    </section>
  );
}
