import { describe, expect, it } from 'vitest';
import type { Competition, FeatureSnapshot, Match, Team } from '@sports-prediction/domain';
import {
  asCompetitionId,
  asMatchId,
  asSportId,
  asTeamId,
  type MatchContext,
} from '@sports-prediction/domain';
import { impliedOutcome } from './evaluatePrediction.js';
import { FOOTBALL_V2_MODEL_VERSION, predictV2 } from './footballV2.js';
import { argmaxOutcome } from './poisson.js';

function buildFixture(overrides: Partial<FeatureSnapshot> = {}): {
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
  const homeTeam: Team = {
    id: asTeamId('bar'),
    sportId,
    canonicalName: 'Barcelona',
    aliases: [],
  };
  const awayTeam: Team = {
    id: asTeamId('rma'),
    sportId,
    canonicalName: 'Real Madrid',
    aliases: [],
  };
  const snapshot: FeatureSnapshot = {
    matchId: match.id,
    dataCutoffAt: new Date('2026-10-02T13:55:00.000Z'),
    homeForm: ['W', 'W', 'D', 'W', 'W'],
    awayForm: ['L', 'D', 'L', 'L', 'D'],
    homeAttack: 2.2,
    awayAttack: 0.8,
    homeDefense: 0.7,
    awayDefense: 1.9,
    homeStrength: 1.6,
    awayStrength: 0.9,
    restDaysHome: 4,
    restDaysAway: 3,
    injuryImpactHome: 0,
    injuryImpactAway: 0,
    squadChangeHome: 0,
    squadChangeAway: 0,
    dataCompleteness: 0.85,
    ...overrides,
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

describe('predictV2 (football-v2)', () => {
  it('returns probabilities that sum to one and a score consistent with the favourite', () => {
    // Arrange
    const { context, snapshot } = buildFixture();

    // Act
    const result = predictV2(context, snapshot);

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { outcomeProbabilities, predictedScore, confidence, modelVersion } = result.value;
    expect(modelVersion).toBe(FOOTBALL_V2_MODEL_VERSION);
    expect(outcomeProbabilities).not.toBeNull();
    if (!outcomeProbabilities) return;
    const total =
      outcomeProbabilities.home + outcomeProbabilities.draw + outcomeProbabilities.away;
    expect(total).toBeCloseTo(1, 9);
    const favourite = argmaxOutcome(outcomeProbabilities);
    expect(favourite).toBe('home');
    expect(impliedOutcome(predictedScore.home, predictedScore.away)).toBe(favourite);
    expect(confidence).toBe(Math.round(outcomeProbabilities.home * 100));
  });

  it('is less confident when ratings are balanced', () => {
    // Arrange
    const strong = buildFixture();
    const balanced = buildFixture({
      homeAttack: 1.35,
      awayAttack: 1.35,
      homeDefense: 1.35,
      awayDefense: 1.35,
      homeForm: ['W', 'L', 'D', 'W', 'L'],
      awayForm: ['W', 'L', 'D', 'W', 'L'],
    });

    // Act
    const strongResult = predictV2(strong.context, strong.snapshot);
    const balancedResult = predictV2(balanced.context, balanced.snapshot);

    // Assert
    expect(strongResult.ok && balancedResult.ok).toBe(true);
    if (!strongResult.ok || !balancedResult.ok) return;
    expect(balancedResult.value.confidence).toBeLessThan(strongResult.value.confidence);
    expect(balancedResult.value.confidence).toBeLessThan(60);
  });

  it('shrinks extreme ratings toward the league average when data is thin', () => {
    // Arrange
    const rich = buildFixture({ dataCompleteness: 0.95 });
    const thin = buildFixture({ dataCompleteness: 0.3 });

    // Act
    const richResult = predictV2(rich.context, rich.snapshot);
    const thinResult = predictV2(thin.context, thin.snapshot);

    // Assert
    if (!richResult.ok || !thinResult.ok) throw new Error('expected ok');
    expect(thinResult.value.expectedGoals.home).toBeLessThan(
      richResult.value.expectedGoals.home,
    );
    expect(thinResult.value.confidence).toBeLessThan(richResult.value.confidence);
  });

  it('rejects feature snapshots that leak past the data cutoff', () => {
    // Arrange
    const { context, snapshot } = buildFixture();
    const leaked: FeatureSnapshot = {
      ...snapshot,
      dataCutoffAt: new Date('2026-10-02T14:30:00.000Z'),
    };

    // Act
    const result = predictV2(context, leaked);

    // Assert
    expect(result).toEqual({ ok: false, error: 'invalid_cutoff' });
  });
});
