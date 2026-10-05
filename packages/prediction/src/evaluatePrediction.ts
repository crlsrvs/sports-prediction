import type {
  MatchOutcome,
  OutcomeProbabilities,
  PredictedScore,
  PredictionEvaluation,
} from '@sports-prediction/domain';

const MIN_PROBABILITY = 1e-6;

export function impliedOutcome(home: number, away: number): MatchOutcome {
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

/**
 * Ranked probability score for a 1X2 forecast. Outcomes are ordered
 * home → draw → away (the usual ordinal scale for the home side).
 * Range [0, 1]; lower is better. A uniform forecast scores 5/18 on a
 * home or away result and 1/9 on a draw.
 */
export function rankedProbabilityScore(
  probabilities: OutcomeProbabilities,
  actual: MatchOutcome,
): number {
  const order: readonly MatchOutcome[] = ['home', 'draw', 'away'];
  let cumulativePredicted = 0;
  let cumulativeObserved = 0;
  let total = 0;
  for (let index = 0; index < order.length - 1; index += 1) {
    const outcome = order[index] ?? 'home';
    cumulativePredicted += probabilities[outcome];
    if (outcome === actual) cumulativeObserved += 1;
    const diff = cumulativePredicted - cumulativeObserved;
    total += diff * diff;
  }
  return total / (order.length - 1);
}

/** Multi-class Brier score: sum over outcomes of (p - observed)^2. Range [0, 2]. */
export function brierScore(
  probabilities: OutcomeProbabilities,
  actual: MatchOutcome,
): number {
  const outcomes: readonly MatchOutcome[] = ['home', 'draw', 'away'];
  return outcomes.reduce((total, outcome) => {
    const observed = outcome === actual ? 1 : 0;
    const diff = probabilities[outcome] - observed;
    return total + diff * diff;
  }, 0);
}

export function logLoss(
  probabilities: OutcomeProbabilities,
  actual: MatchOutcome,
): number {
  const probability = Math.max(MIN_PROBABILITY, probabilities[actual]);
  return -Math.log(probability);
}

export function evaluatePrediction(
  predicted: PredictedScore,
  actualHome: number,
  actualAway: number,
  probabilities: OutcomeProbabilities | null = null,
): PredictionEvaluation {
  const predictedOutcome = impliedOutcome(predicted.home, predicted.away);
  const actualOutcome = impliedOutcome(actualHome, actualAway);
  return {
    predictedHome: predicted.home,
    predictedAway: predicted.away,
    actualHome,
    actualAway,
    exactScore: predicted.home === actualHome && predicted.away === actualAway,
    winnerImpliedMatch: predictedOutcome === actualOutcome,
    predictedOutcome,
    actualOutcome,
    brierScore: probabilities ? brierScore(probabilities, actualOutcome) : null,
    logLoss: probabilities ? logLoss(probabilities, actualOutcome) : null,
  };
}
