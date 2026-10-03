import type {
  FeatureSnapshot,
  MatchContext,
  MatchOutcome,
  MatchRatings,
  PredictionFactor,
} from '@sports-prediction/domain';
import { hasMinimumPredictionData } from '@sports-prediction/domain';
import { err, ok, type Result } from '@sports-prediction/shared';
import type {
  PredictionOutput,
  PredictionUnavailableReason,
} from './footballV1.js';
import { argmaxOutcome, buildScoreDistribution, type ScoreDistribution } from './poisson.js';

export const FOOTBALL_V3_MODEL_VERSION = 'football-v3';

const MIN_EXPECTED = 0.2;
const MAX_EXPECTED = 4.0;
/** Below this many prior matches a team's rating is flagged as thin evidence. */
const THIN_HISTORY_MATCHES = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function relativeFactor(
  feature: string,
  ratio: number,
  positiveText: string,
  negativeText: string,
): PredictionFactor | null {
  const impact = Math.abs(ratio - 1);
  if (impact < 0.03) return null;
  return {
    feature,
    value: Number((ratio - 1).toFixed(3)),
    impact: Number(impact.toFixed(3)),
    direction: ratio > 1 ? 'positive' : 'negative',
    explanation: ratio > 1 ? positiveText : negativeText,
  };
}

function buildFactors(
  context: MatchContext,
  ratings: MatchRatings,
  distribution: ScoreDistribution,
): PredictionFactor[] {
  const { homeTeam, awayTeam } = context;
  const average = ratings.leagueAverageGoals || 1;
  const factors: PredictionFactor[] = [];

  const homeAdvantageFactor = relativeFactor(
    'home_advantage',
    ratings.homeAdvantage,
    `${homeTeam.canonicalName} juega de local (ventaja estimada ${Math.round((ratings.homeAdvantage - 1) * 100)}%)`,
    'La localía pesa poco en los datos recientes',
  );
  if (homeAdvantageFactor) factors.push(homeAdvantageFactor);

  const candidates: Array<PredictionFactor | null> = [
    relativeFactor(
      'home_attack_rating',
      ratings.homeAttack,
      `${homeTeam.canonicalName} tiene un ataque superior a la media ajustado por rivales`,
      `${homeTeam.canonicalName} tiene un ataque inferior a la media ajustado por rivales`,
    ),
    relativeFactor(
      'away_defense_rating',
      ratings.awayDefense / average,
      `${awayTeam.canonicalName} concede más de lo esperado frente a su calendario`,
      `${awayTeam.canonicalName} defiende mejor que la media ajustado por rivales`,
    ),
    relativeFactor(
      'away_attack_rating',
      ratings.awayAttack,
      `${awayTeam.canonicalName} tiene un ataque superior a la media ajustado por rivales`,
      `${awayTeam.canonicalName} tiene un ataque inferior a la media ajustado por rivales`,
    ),
    relativeFactor(
      'home_defense_rating',
      ratings.homeDefense / average,
      `${homeTeam.canonicalName} concede más de lo esperado frente a su calendario`,
      `${homeTeam.canonicalName} defiende mejor que la media ajustado por rivales`,
    ),
  ];
  for (const factor of candidates) {
    if (factor) factors.push(factor);
  }

  if (Math.abs(ratings.rho) >= 0.02) {
    factors.push({
      feature: 'low_score_dependency',
      value: Number(ratings.rho.toFixed(3)),
      impact: Number(Math.abs(ratings.rho).toFixed(3)),
      direction: 'neutral',
      explanation:
        ratings.rho < 0
          ? 'Los marcadores 0-0 y 1-1 son más frecuentes de lo que indica Poisson puro'
          : 'Los marcadores 1-0 y 0-1 son más frecuentes de lo que indica Poisson puro',
    });
  }

  const thinTeams = [
    ratings.homeMatches < THIN_HISTORY_MATCHES ? homeTeam.canonicalName : null,
    ratings.awayMatches < THIN_HISTORY_MATCHES ? awayTeam.canonicalName : null,
  ].filter((name): name is string => name !== null);
  if (thinTeams.length > 0) {
    factors.push({
      feature: 'thin_history',
      value: Math.min(ratings.homeMatches, ratings.awayMatches),
      impact: 0.1,
      direction: 'negative',
      explanation: `Pocos partidos previos para ${thinTeams.join(' y ')}; el rating se acerca a la media de la liga`,
    });
  }

  const spread = Math.abs(distribution.outcome.home - distribution.outcome.away);
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

function pickScoreForOutcome(
  distribution: ScoreDistribution,
  outcome: MatchOutcome,
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

/**
 * Football v3 (Dixon-Coles): expected goals come from jointly fitted,
 * opponent-adjusted and time-decayed attack/defense ratings with an explicit
 * home advantage; the score distribution applies the low-score correction.
 * Requires `featureSnapshot.ratings`; falls back to "unavailable" otherwise.
 */
export function predictV3(
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

  const ratings = featureSnapshot.ratings;
  if (!ratings || ratings.model !== 'dixon-coles') {
    return err('missing_ratings');
  }

  const expectedGoals = {
    home: clamp(
      ratings.homeAttack * ratings.awayDefense * ratings.homeAdvantage,
      MIN_EXPECTED,
      MAX_EXPECTED,
    ),
    away: clamp(ratings.awayAttack * ratings.homeDefense, MIN_EXPECTED, MAX_EXPECTED),
  };

  const distribution = buildScoreDistribution(
    expectedGoals.home,
    expectedGoals.away,
    undefined,
    ratings.rho,
  );
  const predictedOutcome = argmaxOutcome(distribution.outcome);
  const predictedScore = pickScoreForOutcome(distribution, predictedOutcome);
  const confidence = Math.round(
    clamp(distribution.outcome[predictedOutcome], 0.05, 0.95) * 100,
  );

  return ok({
    predictedScore,
    expectedGoals,
    confidence,
    factors: buildFactors(context, ratings, distribution),
    modelVersion: FOOTBALL_V3_MODEL_VERSION,
    outcomeProbabilities: distribution.outcome,
  });
}
