import type { Competition, FeatureSnapshot, Match, Team } from './entities.js';

/**
 * Inputs available to the Prediction Engine at a given data cutoff.
 * Callers must ensure features only reflect information available at `dataCutoffAt`.
 */
export interface MatchContext {
  readonly match: Match;
  readonly competition: Competition;
  readonly homeTeam: Team;
  readonly awayTeam: Team;
  readonly featureSnapshot: FeatureSnapshot;
  readonly dataCutoffAt: Date;
}

export function hasMinimumPredictionData(context: MatchContext): boolean {
  const { match, homeTeam, awayTeam, competition, featureSnapshot } = context;

  const hasIdentity =
    Boolean(match.id) &&
    Boolean(homeTeam.id) &&
    Boolean(awayTeam.id) &&
    Boolean(competition.id);

  const hasForm =
    featureSnapshot.homeForm.length > 0 && featureSnapshot.awayForm.length > 0;

  const hasStrength =
    Number.isFinite(featureSnapshot.homeStrength) &&
    Number.isFinite(featureSnapshot.awayStrength) &&
    Number.isFinite(featureSnapshot.homeAttack) &&
    Number.isFinite(featureSnapshot.awayAttack) &&
    Number.isFinite(featureSnapshot.homeDefense) &&
    Number.isFinite(featureSnapshot.awayDefense);

  return hasIdentity && hasForm && hasStrength;
}
