import { useMemo, useState } from 'react';
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
  const [competitionFilter, setCompetitionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const meta = useQuery({
    queryKey: ['meta'],
    queryFn: api.getMeta,
  });

  const query = useQuery({
    queryKey: ['matches', 'today'],
    queryFn: api.getTodayMatches,
  });

  const competitions = useMemo(() => {
    const names = new Set(
      (query.data ?? []).map((card) => card.competition.name),
    );
    return [...names].sort();
  }, [query.data]);

  const filtered = useMemo(() => {
    return (query.data ?? []).filter((card) => {
      if (
        competitionFilter !== 'all' &&
        card.competition.name !== competitionFilter
      ) {
        return false;
      }
      if (statusFilter !== 'all' && card.match.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [query.data, competitionFilter, statusFilter]);

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

  const byCompetition = groupByCompetition(filtered);

  return (
    <section className={styles.list}>
      <h2 className={styles.emptyTitle}>Hoy</h2>

      {meta.data?.dataMode === 'seed' ? (
        <p className={styles.banner} role="status">
          Datos demo (seed). Los partidos de hoy son de ejemplo hasta configurar
          API_FOOTBALL_KEY e ingerir fixtures reales.
        </p>
      ) : null}

      {meta.data?.dataMode === 'live' ? (
        <p className={styles.bannerLive} role="status">
          Datos reales desde API-Football. Si hoy no hay jornada de PL/UCL/La
          Liga, se muestra la última jornada disponible.
        </p>
      ) : null}

      <div className={styles.filters}>
        <label>
          Competición
          <select
            value={competitionFilter}
            onChange={(event) => setCompetitionFilter(event.target.value)}
          >
            <option value="all">Todas</option>
            {competitions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">Todos</option>
            <option value="scheduled">Programado</option>
            <option value="live">En vivo</option>
            <option value="finished">Finalizado</option>
          </select>
        </label>
      </div>

      {byCompetition.length === 0 ? (
        <p className={styles.message}>No hay partidos con esos filtros.</p>
      ) : (
        byCompetition.map(([competition, cards]) => (
          <div key={competition} className={styles.competitionBlock}>
            <h3 className={styles.competitionName}>{competition}</h3>
            <ul className={styles.matches}>
              {cards.map((card) => (
                <li key={card.match.id} className={styles.matchItem}>
                  <div>
                    <p className={styles.kickoff}>
                      {formatKickoff(card.match.scheduledAt)} · {card.match.status}
                    </p>
                    <p className={styles.teams}>
                      {card.homeTeam.canonicalName} vs{' '}
                      {card.awayTeam.canonicalName}
                    </p>
                    <p className={styles.form}>
                      Forma: {formatForm(card.homeForm)} /{' '}
                      {formatForm(card.awayForm)}
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
        ))
      )}
    </section>
  );
}
