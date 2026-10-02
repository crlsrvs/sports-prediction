import type { PredictedScore, PredictionEvaluation } from '@sports-prediction/domain';

function impliedWinner(
  home: number,
  away: number,
): 'home' | 'away' | 'draw' {
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

export function evaluatePrediction(
  predicted: PredictedScore,
  actualHome: number,
  actualAway: number,
): PredictionEvaluation {
  return {
    predictedHome: predicted.home,
    predictedAway: predicted.away,
    actualHome,
    actualAway,
    exactScore: predicted.home === actualHome && predicted.away === actualAway,
    winnerImpliedMatch:
      impliedWinner(predicted.home, predicted.away) ===
      impliedWinner(actualHome, actualAway),
  };
}
