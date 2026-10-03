import type {
  OutcomeProbabilities,
  PredictedScore,
} from '@sports-prediction/domain';
import { dixonColesTau } from '@sports-prediction/shared';

const MIN_CELL_FACTOR = 1e-6;

export const DEFAULT_MAX_GOALS = 8;

/** Poisson probability mass computed in log-space to avoid overflow. */
export function poissonPmf(k: number, lambda: number): number {
  if (k < 0) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logProbability = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i += 1) {
    logProbability -= Math.log(i);
  }
  return Math.exp(logProbability);
}

export interface ScoreDistribution {
  /** matrix[home][away] = P(home goals, away goals), normalized to sum 1. */
  readonly matrix: readonly (readonly number[])[];
  readonly maxGoals: number;
  readonly outcome: OutcomeProbabilities;
  readonly mostProbableScore: PredictedScore;
  readonly mostProbableScoreProbability: number;
}

/**
 * Builds the joint score distribution assuming independent Poisson goals,
 * optionally applying the Dixon-Coles low-score correction (`rho`).
 * Truncated at `maxGoals` and renormalized so probabilities sum to 1.
 */
export function buildScoreDistribution(
  expectedHome: number,
  expectedAway: number,
  maxGoals: number = DEFAULT_MAX_GOALS,
  rho = 0,
): ScoreDistribution {
  const homePmf = Array.from({ length: maxGoals + 1 }, (_, k) =>
    poissonPmf(k, expectedHome),
  );
  const awayPmf = Array.from({ length: maxGoals + 1 }, (_, k) =>
    poissonPmf(k, expectedAway),
  );

  const raw: number[][] = [];
  let total = 0;
  for (let home = 0; home <= maxGoals; home += 1) {
    const row: number[] = [];
    for (let away = 0; away <= maxGoals; away += 1) {
      const factor =
        rho === 0
          ? 1
          : Math.max(
              MIN_CELL_FACTOR,
              dixonColesTau(home, away, expectedHome, expectedAway, rho),
            );
      const probability = (homePmf[home] ?? 0) * (awayPmf[away] ?? 0) * factor;
      row.push(probability);
      total += probability;
    }
    raw.push(row);
  }

  const normalizer = total > 0 ? 1 / total : 1;
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let best: PredictedScore = { home: 0, away: 0 };
  let bestProbability = -1;

  const matrix = raw.map((row, home) =>
    row.map((value, away) => {
      const probability = value * normalizer;
      if (home > away) homeWin += probability;
      else if (home === away) draw += probability;
      else awayWin += probability;

      if (probability > bestProbability) {
        bestProbability = probability;
        best = { home, away };
      }
      return probability;
    }),
  );

  return {
    matrix,
    maxGoals,
    outcome: { home: homeWin, draw, away: awayWin },
    mostProbableScore: best,
    mostProbableScoreProbability: Math.max(0, bestProbability),
  };
}

export function argmaxOutcome(
  probabilities: OutcomeProbabilities,
): 'home' | 'draw' | 'away' {
  if (
    probabilities.home >= probabilities.draw &&
    probabilities.home >= probabilities.away
  ) {
    return 'home';
  }
  if (probabilities.away >= probabilities.draw) return 'away';
  return 'draw';
}
