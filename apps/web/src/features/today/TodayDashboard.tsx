import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { MatchCard } from '@sports-prediction/domain';
import { api } from '../../shared/api.js';
import { formatForm, formatKickoff } from '../../shared/format.js';
import styles from './TodayDashboard.module.css';

function groupByCompetition(
  cards: readonly MatchCard[],
): Array<readonly [string, MatchCard[]]> {
  const groups = new Map<string, MatchCard[]>();
  for (const card of cards) {
    const key = card.competition.name;
    const current = groups.get(key) ?? [];
    current.push(card);
    groups.set(key, current);
  }
  return [...groups.entries()];
}

export function TodayDashboard() {
  const query = useQuery({
    queryKey: ['matches', 'today'],
    queryFn: api.getTodayMatches,
  });

  if (query.isPending) {
    return <p className={styles.message}>Cargando partidos…</p>;
  }

  if (query.isError) {
    return (
      <section className={styles.emptyState}>
        <h2 className={styles.emptyTitle}>Hoy</h2>
        <p className={styles.message}>
          No se pudo cargar el listado. ¿Está corriendo la API en el puerto 3000?
        </p>
      </section>
    );
  }

  const byCompetition = groupByCompetition(query.data);

  return (
    <section className={styles.list}>
      <h2 className={styles.emptyTitle}>Hoy</h2>
      {byCompetition.map(([competition, cards]) => (
        <div key={competition} className={styles.competitionBlock}>
          <h3 className={styles.competitionName}>{competition}</h3>
          <ul className={styles.matches}>
            {cards.map((card) => (
              <li key={card.match.id} className={styles.matchItem}>
                <div>
                  <p className={styles.kickoff}>
                    {formatKickoff(card.match.scheduledAt)}
                  </p>
                  <p className={styles.teams}>
                    {card.homeTeam.canonicalName} vs {card.awayTeam.canonicalName}
                  </p>
                  <p className={styles.form}>
                    Forma: {formatForm(card.homeForm)} / {formatForm(card.awayForm)}
                  </p>
                  {card.prediction ? (
                    <p className={styles.prediction}>
                      Marcador estimado:{' '}
                      {card.prediction.predictedScore.home} -{' '}
                      {card.prediction.predictedScore.away} (
                      {card.prediction.confidence}%)
                    </p>
                  ) : null}
                </div>
                <Link
                  className={styles.analyzeButton}
                  to={`/matches/${card.match.id}`}
                >
                  Analizar
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
