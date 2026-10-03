import { describe, expect, it } from 'vitest';
import type {
  Competition,
  FeatureSnapshot,
  Match,
  MatchRatings,
  Team,
} from '@sports-prediction/domain';
import {
  asCompetitionId,
  asMatchId,
  asSportId,
  asTeamId,
  type MatchContext,
} from '@sports-prediction/domain';
import { impliedOutcome } from './evaluatePrediction.js';
import { FOOTBALL_V3_MODEL_VERSION, predictV3 } from './footballV3.js';
import { argmaxOutcome } from './poisson.js';

const BASE_RATINGS: MatchRatings = {
  model: 'dixon-coles',
  homeAttack: 1.4,
  homeDefense: 0.9,
  awayAttack: 0.8,
  awayDefense: 1.6,
  homeAdvantage: 1.25,
  rho: -0.08,
  leagueAverageGoals: 1.35,
  homeMatches: 40,
  awayMatches: 40,
};

function buildFixture(ratings: MatchRatings | null = BASE_RATINGS): {
  context: MatchContext;
  snapshot: FeatureSnapshot;
} {
  const sportId = asSportId('football');
  const match: Match = {
    id: asMatchId('m1'),
    sportId,
    competitionId: asCompetitionId('ucl'),
    seasonId: null,
    homeTeamId: asTeamId('bar'),
    awayTeamId: asTeamId('rma'),
    scheduledAt: new Date('2026-10-02T14:00:00.000Z'),
    venueId: null,
    status: 'scheduled',
    homeScore: null,
    awayScore: null,
    sourceId: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  };
  const competition: Competition = {
    id: asCompetitionId('ucl'),
    sportId,
    name: 'UEFA Champions League',
    country: null,
    active: true,
  };
  const homeTeam: Team = { id: asTeamId('bar'), sportId, canonicalName: 'Barcelona', aliases: [] };
  const awayTeam: Team = { id: asTeamId('rma'), sportId, canonicalName: 'Real Madrid', aliases: [] };
  const snapshot: FeatureSnapshot = {
    matchId: match.id,
    dataCutoffAt: new Date('2026-10-02T13:55:00.000Z'),
    ratings,
    homeForm: ['W', 'W', 'D', 'W', 'W'],
    awayForm: ['L', 'D', 'L', 'L', 'D'],
    homeAttack: 2.0,
    awayAttack: 0.9,
    homeDefense: 0.8,
    awayDefense: 1.7,
    homeStrength: 1.6,
    awayStrength: 0.9,
    restDaysHome: 4,
    restDaysAway: 3,
    injuryImpactHome: 0,
    injuryImpactAway: 0,
    squadChangeHome: 0,
    squadChangeAway: 0,
    dataCompleteness: 0.85,
  };
  return {
    context: {
      match,
      competition,
      homeTeam,
      awayTeam,
      featureSnapshot: snapshot,
      dataCutoffAt: snapshot.dataCutoffAt,
    },
    snapshot,
  };
}

describe('predictV3 (football-v3, Dixon-Coles)', () => {
  it('derives expected goals from ratings and a coherent score/outcome', () => {
    // Arrange
    const { context, snapshot } = buildFixture();

    // Act
    const result = predictV3(context, snapshot);

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { expectedGoals, outcomeProbabilities, predictedScore, confidence, modelVersion } =
      result.value;
    expect(modelVersion).toBe(FOOTBALL_V3_MODEL_VERSION);
    expect(expectedGoals.home).toBeCloseTo(1.4 * 1.6 * 1.25, 6);
    expect(expectedGoals.away).toBeCloseTo(0.8 * 0.9, 6);
    if (!outcomeProbabilities) throw new Error('expected probabilities');
    const favourite = argmaxOutcome(outcomeProbabilities);
    expect(favourite).toBe('home');
    expect(impliedOutcome(predictedScore.home, predictedScore.away)).toBe(favourite);
    expect(confidence).toBe(Math.round(outcomeProbabilities.home * 100));
    expect(result.value.factors.some((f) => f.feature === 'home_attack_rating')).toBe(true);
    expect(result.value.factors.some((f) => f.feature === 'low_score_dependency')).toBe(true);
  });

  it('flags thin history when a team has few prior matches', () => {
    // Arrange
    const { context, snapshot } = buildFixture({ ...BASE_RATINGS, awayMatches: 2 });

    // Act
    const result = predictV3(context, snapshot);

    // Assert
    if (!result.ok) throw new Error('expected ok');
    const thin = result.value.factors.find((f) => f.feature === 'thin_history');
    expect(thin?.direction).toBe('negative');
    expect(thin?.explanation).toContain('Real Madrid');
  });

  it('is unavailable without fitted ratings', () => {
    // Arrange
    const { context, snapshot } = buildFixture(null);

    // Act
    const result = predictV3(context, snapshot);

    // Assert
    expect(result).toEqual({ ok: false, error: 'missing_ratings' });
  });

  it('rejects feature snapshots that leak past the data cutoff', () => {
    // Arrange
    const { context, snapshot } = buildFixture();
    const leaked: FeatureSnapshot = {
      ...snapshot,
      dataCutoffAt: new Date('2026-10-02T14:30:00.000Z'),
    };

    // Act
    const result = predictV3(context, leaked);

    // Assert
    expect(result).toEqual({ ok: false, error: 'invalid_cutoff' });
  });
});
