import type { FeatureSnapshot, Match, MatchId, TeamId } from '@sports-prediction/domain';

export interface FinishedMatchResult {
  readonly match: Match;
  readonly homeScore: number;
  readonly awayScore: number;
}

function resultForTeam(
  match: FinishedMatchResult,
  teamId: TeamId,
): 'W' | 'D' | 'L' | null {
  const isHome = match.match.homeTeamId === teamId;
  const isAway = match.match.awayTeamId === teamId;
  if (!isHome && !isAway) return null;

  if (match.homeScore === match.awayScore) return 'D';
  const teamWon = isHome
    ? match.homeScore > match.awayScore
    : match.awayScore > match.homeScore;
  return teamWon ? 'W' : 'L';
}

function recentForm(
  teamId: TeamId,
  history: readonly FinishedMatchResult[],
  cutoff: Date,
  limit = 5,
): string[] {
  return history
    .filter(
      (item) =>
        item.match.scheduledAt.getTime() < cutoff.getTime() &&
        (item.match.homeTeamId === teamId || item.match.awayTeamId === teamId),
    )
    .sort(
      (a, b) => b.match.scheduledAt.getTime() - a.match.scheduledAt.getTime(),
    )
    .slice(0, limit)
    .map((item) => resultForTeam(item, teamId))
    .filter((value): value is 'W' | 'D' | 'L' => value !== null)
    .reverse();
}

function averageGoalsFor(
  teamId: TeamId,
  history: readonly FinishedMatchResult[],
  cutoff: Date,
  side: 'attack' | 'defense',
): number {
  const relevant = history.filter(
    (item) =>
      item.match.scheduledAt.getTime() < cutoff.getTime() &&
      (item.match.homeTeamId === teamId || item.match.awayTeamId === teamId),
  );

  if (relevant.length === 0) return 1;

  const total = relevant.reduce((sum, item) => {
    const isHome = item.match.homeTeamId === teamId;
    if (side === 'attack') {
      return sum + (isHome ? item.homeScore : item.awayScore);
    }
    return sum + (isHome ? item.awayScore : item.homeScore);
  }, 0);

  return total / relevant.length;
}

function restDays(
  teamId: TeamId,
  history: readonly FinishedMatchResult[],
  matchDate: Date,
): number | null {
  const previous = history
    .filter(
      (item) =>
        item.match.scheduledAt.getTime() < matchDate.getTime() &&
        (item.match.homeTeamId === teamId || item.match.awayTeamId === teamId),
    )
    .sort(
      (a, b) => b.match.scheduledAt.getTime() - a.match.scheduledAt.getTime(),
    )[0];

  if (!previous) return null;
  const ms = matchDate.getTime() - previous.match.scheduledAt.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Builds a reproducible feature snapshot using only matches strictly before `dataCutoffAt`.
 */
export function buildFeatureSnapshot(input: {
  readonly matchId: MatchId;
  readonly homeTeamId: TeamId;
  readonly awayTeamId: TeamId;
  readonly matchScheduledAt: Date;
  readonly dataCutoffAt: Date;
  readonly history: readonly FinishedMatchResult[];
  readonly injuryImpactHome?: number;
  readonly injuryImpactAway?: number;
  readonly squadChangeHome?: number;
  readonly squadChangeAway?: number;
}): FeatureSnapshot {
  const {
    matchId,
    homeTeamId,
    awayTeamId,
    matchScheduledAt,
    dataCutoffAt,
    history,
  } = input;

  const homeForm = recentForm(homeTeamId, history, dataCutoffAt);
  const awayForm = recentForm(awayTeamId, history, dataCutoffAt);
  const homeAttack = averageGoalsFor(homeTeamId, history, dataCutoffAt, 'attack');
  const awayAttack = averageGoalsFor(awayTeamId, history, dataCutoffAt, 'attack');
  const homeDefense = averageGoalsFor(homeTeamId, history, dataCutoffAt, 'defense');
  const awayDefense = averageGoalsFor(awayTeamId, history, dataCutoffAt, 'defense');

  const homeStrength =
    homeAttack * 0.45 + (2 - homeDefense) * 0.35 + homeForm.filter((r) => r === 'W').length * 0.04;
  const awayStrength =
    awayAttack * 0.45 + (2 - awayDefense) * 0.35 + awayForm.filter((r) => r === 'W').length * 0.04;

  const formReady = homeForm.length > 0 && awayForm.length > 0;
  const dataCompleteness = formReady ? 0.75 + Math.min(homeForm.length, awayForm.length) * 0.04 : 0.35;

  return {
    matchId,
    dataCutoffAt,
    homeForm,
    awayForm,
    homeAttack,
    awayAttack,
    homeDefense,
    awayDefense,
    homeStrength,
    awayStrength,
    restDaysHome: restDays(homeTeamId, history, matchScheduledAt),
    restDaysAway: restDays(awayTeamId, history, matchScheduledAt),
    injuryImpactHome: input.injuryImpactHome ?? 0,
    injuryImpactAway: input.injuryImpactAway ?? 0,
    squadChangeHome: input.squadChangeHome ?? 0,
    squadChangeAway: input.squadChangeAway ?? 0,
    dataCompleteness: Math.min(0.95, dataCompleteness),
  };
}
