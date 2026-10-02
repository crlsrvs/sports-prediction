import { describe, expect, it } from 'vitest';
import type { Competition, FeatureSnapshot, Match, Team } from '@sports-prediction/domain';
import {
  asCompetitionId,
  asMatchId,
  asSportId,
  asTeamId,
  type MatchContext,
} from '@sports-prediction/domain';
import { FOOTBALL_MODEL_VERSION, predict } from './footballV1.js';

function buildFixture(): {
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
    aliases: ['Barça'],
  };

  const awayTeam: Team = {
    id: asTeamId('rma'),
    sportId,
    canonicalName: 'Real Madrid',
    aliases: ['Madrid'],
  };

  const snapshot: FeatureSnapshot = {
    matchId: match.id,
    dataCutoffAt: new Date('2026-10-02T13:55:00.000Z'),
    homeForm: ['W', 'W', 'D', 'W', 'W'],
    awayForm: ['W', 'D', 'W', 'L', 'W'],
    homeAttack: 1.6,
    awayAttack: 1.2,
    homeDefense: 0.95,
    awayDefense: 1.1,
    homeStrength: 1.4,
    awayStrength: 1.2,
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

describe('predictionEngine.predict (football-v1)', () => {
  it('returns a deterministic score estimate with factors', () => {
    // Arrange
    const { context, snapshot } = buildFixture();

    // Act
    const result = predict(context, snapshot);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.modelVersion).toBe(FOOTBALL_MODEL_VERSION);
      expect(result.value.predictedScore.home).toBeGreaterThanOrEqual(0);
      expect(result.value.predictedScore.away).toBeGreaterThanOrEqual(0);
      expect(result.value.confidence).toBeGreaterThan(0);
      expect(result.value.factors.length).toBeGreaterThan(0);
    }
  });

  it('rejects feature snapshots that leak past the data cutoff', () => {
    // Arrange
    const { context, snapshot } = buildFixture();
    const leaked: FeatureSnapshot = {
      ...snapshot,
      dataCutoffAt: new Date('2026-10-02T14:30:00.000Z'),
    };

    // Act
    const result = predict(context, leaked);

    // Assert
    expect(result).toEqual({ ok: false, error: 'invalid_cutoff' });
  });
});
