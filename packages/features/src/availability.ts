/**
 * Turns absences and lineups that were already known at `dataCutoffAt` into
 * the two snapshot fields the engines already understand.
 *
 * An absence counts only when we learned it before the cutoff and before
 * kickoff, and it was reported for a fixture within 36h of this match.
 * Anything fetched after the match stays out, so backtests cannot see it.
 *
 * `injuryImpact` is negative expected goals, capped. `squadChange` is the
 * negative share of the last known lineup that is now absent (0 when we
 * have no prior lineup). Engines add `squadChange * 0.05` to expected goals.
 */

const ABSENCE_WINDOW_MS = 36 * 60 * 60 * 1000;
const GOAL_WEIGHT_PER_ABSENCE = 0.06;
const MAX_INJURY_IMPACT = 0.3;

export interface AbsenceFact {
  readonly teamId: string;
  readonly playerName: string;
  readonly matchDay: Date;
  readonly knownAt: Date;
}

export interface LineupFact {
  readonly teamId: string;
  readonly matchDay: Date;
  readonly knownAt: Date;
  readonly playerNames: readonly string[];
}

export interface TeamAvailability {
  readonly injuryImpact: number;
  readonly squadChange: number;
  readonly absentPlayers: readonly string[];
}

export function teamAvailability(input: {
  readonly teamId: string;
  readonly kickoffAt: Date;
  readonly dataCutoffAt: Date;
  readonly absences: readonly AbsenceFact[];
  readonly lineups: readonly LineupFact[];
}): TeamAvailability {
  const absent = new Set<string>();
  for (const absence of input.absences) {
    if (absence.teamId !== input.teamId) continue;
    if (!wasKnownInTime(absence.knownAt, input.kickoffAt, input.dataCutoffAt)) continue;
    if (Math.abs(absence.matchDay.getTime() - input.kickoffAt.getTime()) > ABSENCE_WINDOW_MS) {
      continue;
    }
    absent.add(normalizePlayerName(absence.playerName));
  }

  const previous = latestLineup(input.lineups, input.teamId, input.kickoffAt, input.dataCutoffAt);
  const lineupNames = previous?.playerNames.map(normalizePlayerName) ?? [];
  const missingFromLineup = lineupNames.filter((name) => absent.has(name)).length;
  const squadChange =
    lineupNames.length > 0 ? -missingFromLineup / lineupNames.length : 0;

  return {
    injuryImpact:
      absent.size === 0
        ? 0
        : -Math.min(MAX_INJURY_IMPACT, absent.size * GOAL_WEIGHT_PER_ABSENCE),
    squadChange,
    absentPlayers: [...absent],
  };
}

export function availabilityAdjustments(input: {
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly kickoffAt: Date;
  readonly dataCutoffAt: Date;
  readonly absences: readonly AbsenceFact[];
  readonly lineups: readonly LineupFact[];
}): {
  readonly injuryImpactHome: number;
  readonly injuryImpactAway: number;
  readonly squadChangeHome: number;
  readonly squadChangeAway: number;
} {
  const home = teamAvailability({ ...input, teamId: input.homeTeamId });
  const away = teamAvailability({ ...input, teamId: input.awayTeamId });
  return {
    injuryImpactHome: home.injuryImpact,
    injuryImpactAway: away.injuryImpact,
    squadChangeHome: home.squadChange,
    squadChangeAway: away.squadChange,
  };
}

function wasKnownInTime(knownAt: Date, kickoffAt: Date, dataCutoffAt: Date): boolean {
  return (
    knownAt.getTime() <= dataCutoffAt.getTime() && knownAt.getTime() < kickoffAt.getTime()
  );
}

function latestLineup(
  lineups: readonly LineupFact[],
  teamId: string,
  kickoffAt: Date,
  dataCutoffAt: Date,
): LineupFact | null {
  let best: LineupFact | null = null;
  for (const lineup of lineups) {
    if (lineup.teamId !== teamId) continue;
    if (!wasKnownInTime(lineup.knownAt, kickoffAt, dataCutoffAt)) continue;
    if (lineup.matchDay.getTime() >= kickoffAt.getTime()) continue;
    if (!best || lineup.matchDay.getTime() > best.matchDay.getTime()) best = lineup;
  }
  return best;
}

function normalizePlayerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
