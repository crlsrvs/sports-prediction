import type {
  ExpectedGoals,
  FeatureSnapshot,
  MatchContext,
  PredictedScore,
  PredictionFactor,
} from '@sports-prediction/domain';
import { hasMinimumPredictionData } from '@sports-prediction/domain';
import { err, ok, type Result } from '@sports-prediction/shared';

export const FOOTBALL_MODEL_VERSION = 'football-v1';

export type PredictionUnavailableReason =
  | 'missing_minimum_data'
  | 'invalid_cutoff';

export interface PredictionOutput {
  readonly predictedScore: PredictedScore;
  readonly expectedGoals: ExpectedGoals;
  readonly confidence: number;
  readonly factors: readonly PredictionFactor[];
  readonly modelVersion: string;
}

const HOME_ADVANTAGE = 0.18;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundGoals(value: number): number {
  return Math.max(0, Math.round(value));
}

function formScore(form: readonly string[]): number {
  if (form.length === 0) {
    return 0;
  }

  const points = form.reduce((total, result) => {
    if (result === 'W') return total + 3;
    if (result === 'D') return total + 1;
    return total;
  }, 0);

  return points / (form.length * 3);
}

function buildFactors(
  context: MatchContext,
  expectedGoals: ExpectedGoals,
): PredictionFactor[] {
  const { homeTeam, awayTeam, featureSnapshot } = context;
  const factors: PredictionFactor[] = [];

  const homeForm = formScore(featureSnapshot.homeForm);
  const awayForm = formScore(featureSnapshot.awayForm);

  if (homeForm > awayForm) {
    factors.push({
      feature: 'recent_form',
      value: homeForm - awayForm,
      impact: 0.18,
      direction: 'positive',
      explanation: `${homeTeam.canonicalName} tiene mejor forma en sus últimos partidos`,
    });
  } else if (awayForm > homeForm) {
    factors.push({
      feature: 'recent_form',
      value: awayForm - homeForm,
      impact: 0.18,
      direction: 'negative',
      explanation: `${awayTeam.canonicalName} tiene mejor forma en sus últimos partidos`,
    });
  }

  factors.push({
    feature: 'home_advantage',
    value: HOME_ADVANTAGE,
    impact: 0.1,
    direction: 'positive',
    explanation: `${homeTeam.canonicalName} tiene ventaja de local`,
  });

  if (featureSnapshot.homeAttack > featureSnapshot.awayAttack) {
    factors.push({
      feature: 'attack_strength',
      value: featureSnapshot.homeAttack - featureSnapshot.awayAttack,
      impact: 0.15,
      direction: 'positive',
      explanation: `${homeTeam.canonicalName} tiene mejor rendimiento ofensivo reciente`,
    });
  }

  if (featureSnapshot.injuryImpactHome < -0.05) {
    factors.push({
      feature: 'injuries',
      value: featureSnapshot.injuryImpactHome,
      impact: Math.abs(featureSnapshot.injuryImpactHome),
      direction: 'negative',
      explanation: `${homeTeam.canonicalName} tiene una baja importante`,
    });
  }

  if (expectedGoals.home === expectedGoals.away) {
    factors.push({
      feature: 'balanced_match',
      value: 0,
      impact: 0.05,
      direction: 'neutral',
      explanation: 'El encuentro se proyecta equilibrado en goles esperados',
    });
  }

  return factors;
}

function computeExpectedGoals(snapshot: FeatureSnapshot): ExpectedGoals {
  const home =
    snapshot.homeAttack * 0.55 +
    (2 - snapshot.awayDefense) * 0.25 +
    HOME_ADVANTAGE +
    formScore(snapshot.homeForm) * 0.35 +
    snapshot.injuryImpactHome +
    snapshot.squadChangeHome * 0.05;

  const away =
    snapshot.awayAttack * 0.55 +
    (2 - snapshot.homeDefense) * 0.25 +
    formScore(snapshot.awayForm) * 0.35 +
    snapshot.injuryImpactAway +
    snapshot.squadChangeAway * 0.05;

  return {
    home: clamp(home, 0.2, 4.5),
    away: clamp(away, 0.15, 4.5),
  };
}

function computeConfidence(snapshot: FeatureSnapshot): number {
  const sampleBoost =
    Math.min(snapshot.homeForm.length, snapshot.awayForm.length) / 5;
  const raw =
    snapshot.dataCompleteness * 0.7 + sampleBoost * 0.25 + 0.05;
  return Math.round(clamp(raw, 0.05, 0.95) * 100);
}

/**
 * Football v1 statistical engine. Deterministic and side-effect free.
 */
export function predict(
  matchContext: MatchContext,
  featureSnapshot: FeatureSnapshot,
): Result<PredictionOutput, PredictionUnavailableReason> {
  if (featureSnapshot.dataCutoffAt.getTime() > matchContext.dataCutoffAt.getTime()) {
    return err('invalid_cutoff');
  }

  const context: MatchContext = {
    ...matchContext,
    featureSnapshot,
    dataCutoffAt: featureSnapshot.dataCutoffAt,
  };

  if (!hasMinimumPredictionData(context)) {
    return err('missing_minimum_data');
  }

  const expectedGoals = computeExpectedGoals(featureSnapshot);
  const predictedScore: PredictedScore = {
    home: roundGoals(expectedGoals.home),
    away: roundGoals(expectedGoals.away),
  };

  return ok({
    predictedScore,
    expectedGoals,
    confidence: computeConfidence(featureSnapshot),
    factors: buildFactors(context, expectedGoals),
    modelVersion: FOOTBALL_MODEL_VERSION,
  });
}

export const predictionEngine = {
  predict,
};
