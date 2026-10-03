import type {
  ExpectedGoals,
  FeatureSnapshot,
  MatchContext,
  PredictionFactor,
} from '@sports-prediction/domain';
import { hasMinimumPredictionData } from '@sports-prediction/domain';
import { err, ok, type Result } from '@sports-prediction/shared';
import type {
  PredictionOutput,
  PredictionUnavailableReason,
} from './footballV1.js';
import { argmaxOutcome, buildScoreDistribution } from './poisson.js';

export const FOOTBALL_V2_MODEL_VERSION = 'football-v2';

/**
 * League-level priors for top European competitions (goals per team per match).
 * Home sides score ~1.5 and away sides ~1.2 on average; the mean is ~1.35.
 */
const LEAGUE_AVERAGE_GOALS = 1.35;
const HOME_BASE_GOALS = 1.5;
const AWAY_BASE_GOALS = 1.2;

/** How much recent form (last 5) can tilt expected goals, as a multiplier. */
const FORM_WEIGHT = 0.15;

/** Expected goals are clamped to a sane football range. */
const MIN_EXPECTED = 0.2;
const MAX_EXPECTED = 4.0;

/**
 * Bounds for how much we trust raw attack/defense ratios versus the league
 * average. The upper bound was tuned on 2022–2024 backtests (PL/La Liga/UCL)
 * to keep declared confidence close to observed accuracy.
 */
const MIN_EVIDENCE_WEIGHT = 0.3;
const MAX_EVIDENCE_WEIGHT = 0.55;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formScore(form: readonly string[]): number {
  if (form.length === 0) return 0.5;
  const points = form.reduce((total, result) => {
    if (result === 'W') return total + 3;
    if (result === 'D') return total + 1;
    return total;
  }, 0);
  return points / (form.length * 3);
}

/**
 * Shrinks a team rating toward the league average when evidence is thin.
 * `weight` in [0, 1]: 0 keeps the league average, 1 trusts the raw ratio.
 */
function shrinkRatio(value: number, weight: number): number {
  const ratio = value / LEAGUE_AVERAGE_GOALS;
  return 1 + (ratio - 1) * weight;
}

interface ExpectedGoalsBreakdown {
  readonly expectedGoals: ExpectedGoals;
  readonly homeAttackFactor: number;
  readonly awayDefenseFactor: number;
  readonly awayAttackFactor: number;
  readonly homeDefenseFactor: number;
  readonly homeFormFactor: number;
  readonly awayFormFactor: number;
}

function computeExpectedGoals(snapshot: FeatureSnapshot): ExpectedGoalsBreakdown {
  const evidenceWeight = clamp(
    snapshot.dataCompleteness,
    MIN_EVIDENCE_WEIGHT,
    MAX_EVIDENCE_WEIGHT,
  );

  const homeAttackFactor = shrinkRatio(snapshot.homeAttack, evidenceWeight);
  const awayDefenseFactor = shrinkRatio(snapshot.awayDefense, evidenceWeight);
  const awayAttackFactor = shrinkRatio(snapshot.awayAttack, evidenceWeight);
  const homeDefenseFactor = shrinkRatio(snapshot.homeDefense, evidenceWeight);

  const homeFormDelta = formScore(snapshot.homeForm) - 0.5;
  const awayFormDelta = formScore(snapshot.awayForm) - 0.5;
  const homeFormFactor = 1 + homeFormDelta * FORM_WEIGHT * 2;
  const awayFormFactor = 1 + awayFormDelta * FORM_WEIGHT * 2;

  const home =
    HOME_BASE_GOALS *
      homeAttackFactor *
      awayDefenseFactor *
      homeFormFactor +
    snapshot.injuryImpactHome +
    snapshot.squadChangeHome * 0.05;

  const away =
    AWAY_BASE_GOALS *
      awayAttackFactor *
      homeDefenseFactor *
      awayFormFactor +
    snapshot.injuryImpactAway +
    snapshot.squadChangeAway * 0.05;

  return {
    expectedGoals: {
      home: clamp(home, MIN_EXPECTED, MAX_EXPECTED),
      away: clamp(away, MIN_EXPECTED, MAX_EXPECTED),
    },
    homeAttackFactor,
    awayDefenseFactor,
    awayAttackFactor,
    homeDefenseFactor,
    homeFormFactor,
    awayFormFactor,
  };
}

function describeFactor(
  feature: string,
  multiplier: number,
  positiveText: string,
  negativeText: string,
): PredictionFactor | null {
  const impact = Math.abs(multiplier - 1);
  if (impact < 0.03) return null;
  return {
    feature,
    value: Number((multiplier - 1).toFixed(3)),
    impact: Number(impact.toFixed(3)),
    direction: multiplier > 1 ? 'positive' : 'negative',
    explanation: multiplier > 1 ? positiveText : negativeText,
  };
}

function buildFactors(
  context: MatchContext,
  breakdown: ExpectedGoalsBreakdown,
  outcomeProbabilities: { home: number; draw: number; away: number },
): PredictionFactor[] {
  const { homeTeam, awayTeam } = context;
  const factors: PredictionFactor[] = [];

  factors.push({
    feature: 'home_advantage',
    value: Number((HOME_BASE_GOALS / AWAY_BASE_GOALS - 1).toFixed(3)),
    impact: 0.1,
    direction: 'positive',
    explanation: `${homeTeam.canonicalName} juega de local`,
  });

  const candidates: Array<PredictionFactor | null> = [
    describeFactor(
      'home_attack',
      breakdown.homeAttackFactor,
      `${homeTeam.canonicalName} anota por encima de la media de la liga`,
      `${homeTeam.canonicalName} anota por debajo de la media de la liga`,
    ),
    describeFactor(
      'away_defense',
      breakdown.awayDefenseFactor,
      `${awayTeam.canonicalName} concede más goles que la media`,
      `${awayTeam.canonicalName} concede menos goles que la media`,
    ),
    describeFactor(
      'away_attack',
      breakdown.awayAttackFactor,
      `${awayTeam.canonicalName} anota por encima de la media de la liga`,
      `${awayTeam.canonicalName} anota por debajo de la media de la liga`,
    ),
    describeFactor(
      'home_defense',
      breakdown.homeDefenseFactor,
      `${homeTeam.canonicalName} concede más goles que la media`,
      `${homeTeam.canonicalName} concede menos goles que la media`,
    ),
    describeFactor(
      'home_form',
      breakdown.homeFormFactor,
      `${homeTeam.canonicalName} llega en buena racha`,
      `${homeTeam.canonicalName} llega en mala racha`,
    ),
    describeFactor(
      'away_form',
      breakdown.awayFormFactor,
      `${awayTeam.canonicalName} llega en buena racha`,
      `${awayTeam.canonicalName} llega en mala racha`,
    ),
  ];

  for (const factor of candidates) {
    if (factor) factors.push(factor);
  }

  const spread = Math.abs(outcomeProbabilities.home - outcomeProbabilities.away);
  if (spread < 0.08) {
    factors.push({
      feature: 'balanced_match',
      value: Number(spread.toFixed(3)),
      impact: 0.05,
      direction: 'neutral',
      explanation: 'Partido muy equilibrado según la distribución de goles',
    });
  }

  return factors.sort((a, b) => b.impact - a.impact);
}

/**
 * Football v2: multiplicative attack/defense ratings shrunk toward the league
 * average, independent Poisson goal distribution, most-probable score and
 * calibrated confidence equal to the probability of the predicted outcome.
 */
export function predictV2(
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

  const breakdown = computeExpectedGoals(featureSnapshot);
  const distribution = buildScoreDistribution(
    breakdown.expectedGoals.home,
    breakdown.expectedGoals.away,
  );

  const predictedOutcome = argmaxOutcome(distribution.outcome);
  // Choose the most probable score consistent with the most probable outcome,
  // so the headline score never contradicts the implied winner.
  const predictedScore = pickScoreForOutcome(distribution, predictedOutcome);

  const confidence = Math.round(
    clamp(distribution.outcome[predictedOutcome], 0.05, 0.95) * 100,
  );

  return ok({
    predictedScore,
    expectedGoals: breakdown.expectedGoals,
    confidence,
    factors: buildFactors(context, breakdown, distribution.outcome),
    modelVersion: FOOTBALL_V2_MODEL_VERSION,
    outcomeProbabilities: distribution.outcome,
  });
}

function pickScoreForOutcome(
  distribution: ReturnType<typeof buildScoreDistribution>,
  outcome: 'home' | 'draw' | 'away',
): { home: number; away: number } {
  let best = { home: 0, away: 0 };
  let bestProbability = -1;
  distribution.matrix.forEach((row, home) => {
    row.forEach((probability, away) => {
      const matches =
        (outcome === 'home' && home > away) ||
        (outcome === 'draw' && home === away) ||
        (outcome === 'away' && away > home);
      if (matches && probability > bestProbability) {
        bestProbability = probability;
        best = { home, away };
      }
    });
  });
  return best;
}
