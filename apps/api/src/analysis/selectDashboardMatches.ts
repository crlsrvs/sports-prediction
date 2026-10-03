import type { Match } from '@sports-prediction/domain';
import { isLiveSourceId } from '@sports-prediction/shared';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A "matchday" window: the first upcoming kickoff day plus the following days. */
const UPCOMING_WINDOW_DAYS = 4;
const RECENT_WINDOW_DAYS = 3;
const MAX_PER_COMPETITION = 12;

function startOfUtcDay(date: Date): number {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  return day.getTime();
}

function byKickoffAsc(a: Match, b: Match): number {
  return a.scheduledAt.getTime() - b.scheduledAt.getTime();
}

function groupByCompetition(matches: readonly Match[]): Map<string, Match[]> {
  const groups = new Map<string, Match[]>();
  for (const match of matches) {
    const list = groups.get(String(match.competitionId)) ?? [];
    list.push(match);
    groups.set(String(match.competitionId), list);
  }
  return groups;
}

/**
 * Picks what the dashboard shows, in priority order:
 * 1. real fixtures kicking off today;
 * 2. otherwise the next upcoming matchday (first kickoff day + a few days);
 * 3. otherwise the most recent real matchday per competition (historical-only
 *    setups, e.g. free API-Football plans);
 * 4. with no real data at all, today's seed matches.
 */
export function selectDashboardMatches(
  matches: readonly Match[],
  now: Date = new Date(),
): Match[] {
  const dayStart = startOfUtcDay(now);
  const dayEnd = dayStart + DAY_MS - 1;
  const isToday = (match: Match): boolean =>
    match.scheduledAt.getTime() >= dayStart &&
    match.scheduledAt.getTime() <= dayEnd;

  const real = matches.filter((match) => isLiveSourceId(String(match.sourceId)));
  if (real.length === 0) return matches.filter(isToday).sort(byKickoffAsc);

  const todays = real.filter(isToday);
  if (todays.length > 0) return todays.sort(byKickoffAsc);

  const upcoming = real
    .filter(
      (match) =>
        match.status === 'scheduled' && match.scheduledAt.getTime() > now.getTime(),
    )
    .sort(byKickoffAsc);
  const first = upcoming[0];
  if (first) {
    const windowStart = startOfUtcDay(first.scheduledAt);
    const windowEnd = windowStart + UPCOMING_WINDOW_DAYS * DAY_MS;
    const picked: Match[] = [];
    for (const list of groupByCompetition(upcoming).values()) {
      picked.push(
        ...list
          .filter((match) => match.scheduledAt.getTime() < windowEnd)
          .slice(0, MAX_PER_COMPETITION),
      );
    }
    return picked.sort(byKickoffAsc);
  }

  const picked: Match[] = [];
  for (const list of groupByCompetition(real).values()) {
    const sortedDesc = [...list].sort((a, b) => byKickoffAsc(b, a));
    const newest = sortedDesc[0];
    if (!newest) continue;
    const windowStart = startOfUtcDay(newest.scheduledAt) - RECENT_WINDOW_DAYS * DAY_MS;
    picked.push(
      ...sortedDesc
        .filter((match) => match.scheduledAt.getTime() >= windowStart)
        .slice(0, MAX_PER_COMPETITION),
    );
  }
  return picked.sort(byKickoffAsc);
}
