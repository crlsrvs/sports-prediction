import type { MatchRatings, TeamId } from '@sports-prediction/domain';
import { dixonColesTau } from '@sports-prediction/shared';
import type { FinishedMatchResult } from './buildFeatureSnapshot.js';

export interface DixonColesOptions {
  /** Older results lose weight exponentially; after this many days weight halves. */
  readonly halfLifeDays?: number;
  /**
   * Pseudo-matches at league average added to every team. Keeps ratings of
   * newly promoted / rarely seen teams near the average instead of exploding.
   */
  readonly priorWeight?: number;
  readonly iterations?: number;
}

export interface TeamRating {
  readonly attack: number;
  readonly defense: number;
  readonly matches: number;
}

export interface DixonColesFit {
  readonly cutoffAt: Date;
  readonly matches: number;
  readonly teams: number;
  readonly homeAdvantage: number;
  readonly rho: number;
  readonly leagueAverageGoals: number;
  ratingFor(teamId: TeamId): TeamRating;
  matchRatings(homeTeamId: TeamId, awayTeamId: TeamId): MatchRatings;
}

/**
 * Tuned on 2022–2024 PL/La Liga/UCL walk-forward backtests: Brier is flat for
 * half-lives between 365 and 730 days and best around a 6-match prior.
 */
export const DEFAULT_DIXON_COLES_OPTIONS: Required<DixonColesOptions> = {
  halfLifeDays: 365,
  priorWeight: 6,
  iterations: 30,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_RHO = -0.25;
const MAX_RHO = 0.2;
const MIN_TAU = 1e-3;

interface Observation {
  readonly home: number;
  readonly away: number;
  readonly homeGoals: number;
  readonly awayGoals: number;
  readonly weight: number;
}

function goldenSectionMaximum(
  fn: (value: number) => number,
  low: number,
  high: number,
  steps = 40,
): number {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = low;
  let b = high;
  let c = b - ratio * (b - a);
  let d = a + ratio * (b - a);
  let fc = fn(c);
  let fd = fn(d);
  for (let i = 0; i < steps; i += 1) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - ratio * (b - a);
      fc = fn(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + ratio * (b - a);
      fd = fn(d);
    }
  }
  return (a + b) / 2;
}

/**
 * Fits Dixon-Coles attack/defense ratings, home advantage and the low-score
 * parameter rho using only results strictly before `cutoffAt`, with exponential
 * time decay. Attack/defense are estimated with the standard alternating
 * closed-form updates of the weighted Poisson likelihood (plus a league-average
 * prior); rho is then maximised by golden-section search.
 */
export function fitDixonColes(input: {
  readonly history: readonly FinishedMatchResult[];
  readonly cutoffAt: Date;
  readonly options?: DixonColesOptions;
}): DixonColesFit {
  const options = { ...DEFAULT_DIXON_COLES_OPTIONS, ...input.options };
  const cutoffMs = input.cutoffAt.getTime();
  const decay = Math.LN2 / Math.max(1, options.halfLifeDays);

  const teamIndex = new Map<string, number>();
  const teamIds: TeamId[] = [];
  const indexOf = (teamId: TeamId): number => {
    const key = String(teamId);
    const existing = teamIndex.get(key);
    if (existing !== undefined) return existing;
    const index = teamIds.length;
    teamIndex.set(key, index);
    teamIds.push(teamId);
    return index;
  };

  const observations: Observation[] = [];
  let weightedGoals = 0;
  let weightTotal = 0;
  for (const item of input.history) {
    const at = item.match.scheduledAt.getTime();
    if (at >= cutoffMs) continue;
    const ageDays = (cutoffMs - at) / DAY_MS;
    const weight = Math.exp(-decay * ageDays);
    observations.push({
      home: indexOf(item.match.homeTeamId),
      away: indexOf(item.match.awayTeamId),
      homeGoals: item.homeScore,
      awayGoals: item.awayScore,
      weight,
    });
    weightedGoals += weight * (item.homeScore + item.awayScore);
    weightTotal += weight;
  }

  const teamCount = teamIds.length;
  const leagueAverageGoals =
    weightTotal > 0 ? weightedGoals / (2 * weightTotal) : 1.3;
  const prior = options.priorWeight;

  const attack = new Array<number>(teamCount).fill(1);
  const defense = new Array<number>(teamCount).fill(leagueAverageGoals);
  const matchCounts = new Array<number>(teamCount).fill(0);
  for (const observation of observations) {
    matchCounts[observation.home] = (matchCounts[observation.home] ?? 0) + 1;
    matchCounts[observation.away] = (matchCounts[observation.away] ?? 0) + 1;
  }
  let homeAdvantage = 1.2;

  if (observations.length > 0 && teamCount > 0) {
    const goalsFor = new Array<number>(teamCount);
    const rateFor = new Array<number>(teamCount);
    const goalsAgainst = new Array<number>(teamCount);
    const rateAgainst = new Array<number>(teamCount);

    for (let iteration = 0; iteration < options.iterations; iteration += 1) {
      // Attack update: alpha_i = sum(w * goals for) / sum(w * beta_opp * gamma?)
      goalsFor.fill(prior * leagueAverageGoals);
      rateFor.fill(prior * leagueAverageGoals);
      for (const o of observations) {
        goalsFor[o.home] = (goalsFor[o.home] ?? 0) + o.weight * o.homeGoals;
        rateFor[o.home] =
          (rateFor[o.home] ?? 0) + o.weight * (defense[o.away] ?? 1) * homeAdvantage;
        goalsFor[o.away] = (goalsFor[o.away] ?? 0) + o.weight * o.awayGoals;
        rateFor[o.away] = (rateFor[o.away] ?? 0) + o.weight * (defense[o.home] ?? 1);
      }
      for (let i = 0; i < teamCount; i += 1) {
        attack[i] = (goalsFor[i] ?? 0) / Math.max(1e-9, rateFor[i] ?? 0);
      }

      // Defense update: beta_i = sum(w * goals against) / sum(w * alpha_opp * gamma?)
      goalsAgainst.fill(prior * leagueAverageGoals);
      rateAgainst.fill(prior);
      for (const o of observations) {
        goalsAgainst[o.home] = (goalsAgainst[o.home] ?? 0) + o.weight * o.awayGoals;
        rateAgainst[o.home] = (rateAgainst[o.home] ?? 0) + o.weight * (attack[o.away] ?? 1);
        goalsAgainst[o.away] = (goalsAgainst[o.away] ?? 0) + o.weight * o.homeGoals;
        rateAgainst[o.away] =
          (rateAgainst[o.away] ?? 0) + o.weight * (attack[o.home] ?? 1) * homeAdvantage;
      }
      for (let i = 0; i < teamCount; i += 1) {
        defense[i] = (goalsAgainst[i] ?? 0) / Math.max(1e-9, rateAgainst[i] ?? 0);
      }

      // Home advantage update.
      let homeGoals = 0;
      let homeRate = 0;
      for (const o of observations) {
        homeGoals += o.weight * o.homeGoals;
        homeRate += o.weight * (attack[o.home] ?? 1) * (defense[o.away] ?? 1);
      }
      homeAdvantage = homeRate > 0 ? homeGoals / homeRate : 1;

      // Identifiability: mean attack = 1 (scale moves into defense).
      const meanAttack = attack.reduce((sum, value) => sum + value, 0) / teamCount;
      for (let i = 0; i < teamCount; i += 1) {
        attack[i] = (attack[i] ?? 1) / meanAttack;
        defense[i] = (defense[i] ?? 1) * meanAttack;
      }
    }
  }

  const rho =
    observations.length === 0
      ? 0
      : goldenSectionMaximum(
          (candidate) => {
            let logLikelihood = 0;
            for (const o of observations) {
              if (o.homeGoals > 1 || o.awayGoals > 1) continue;
              const lambda =
                (attack[o.home] ?? 1) * (defense[o.away] ?? 1) * homeAdvantage;
              const mu = (attack[o.away] ?? 1) * (defense[o.home] ?? 1);
              const tau = dixonColesTau(o.homeGoals, o.awayGoals, lambda, mu, candidate);
              logLikelihood += o.weight * Math.log(Math.max(MIN_TAU, tau));
            }
            return logLikelihood;
          },
          MIN_RHO,
          MAX_RHO,
        );

  const ratingFor = (teamId: TeamId): TeamRating => {
    const index = teamIndex.get(String(teamId));
    if (index === undefined) {
      return { attack: 1, defense: leagueAverageGoals, matches: 0 };
    }
    return {
      attack: attack[index] ?? 1,
      defense: defense[index] ?? leagueAverageGoals,
      matches: matchCounts[index] ?? 0,
    };
  };

  return {
    cutoffAt: input.cutoffAt,
    matches: observations.length,
    teams: teamCount,
    homeAdvantage,
    rho,
    leagueAverageGoals,
    ratingFor,
    matchRatings: (homeTeamId, awayTeamId) => {
      const home = ratingFor(homeTeamId);
      const away = ratingFor(awayTeamId);
      return {
        model: 'dixon-coles',
        homeAttack: home.attack,
        homeDefense: home.defense,
        awayAttack: away.attack,
        awayDefense: away.defense,
        homeAdvantage,
        rho,
        leagueAverageGoals,
        homeMatches: home.matches,
        awayMatches: away.matches,
      };
    },
  };
}
