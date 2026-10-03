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
