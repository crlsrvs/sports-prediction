import { describe, expect, it } from 'vitest';
import type { Competition, FeatureSnapshot, Match, Team } from './entities.js';
import {
  asCompetitionId,
  asMatchId,
  asSportId,
  asTeamId,
} from './ids.js';
import { hasMinimumPredictionData, type MatchContext } from './matchContext.js';

function buildContext(
  overrides: Partial<{
    homeForm: readonly string[];
    awayForm: readonly string[];
  }> = {},
): MatchContext {
  const sportId = asSportId('football');
  const match: Match = {
    id: asMatchId('m1'),
    sportId,
    competitionId: asCompetitionId('pl'),
    seasonId: null,
    homeTeamId: asTeamId('home'),
    awayTeamId: asTeamId('away'),
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
    id: asCompetitionId('pl'),
    sportId,
    name: 'Premier League',
    country: 'England',
    active: true,
  };

  const homeTeam: Team = {
    id: asTeamId('home'),
    sportId,
    canonicalName: 'Home FC',
    aliases: ['Home'],
  };

  const awayTeam: Team = {
    id: asTeamId('away'),
    sportId,
    canonicalName: 'Away FC',
    aliases: ['Away'],
  };

  const featureSnapshot: FeatureSnapshot = {
    matchId: match.id,
    dataCutoffAt: new Date('2026-10-02T13:55:00.000Z'),
    homeForm: overrides.homeForm ?? ['W', 'W', 'D', 'W', 'W'],
    awayForm: overrides.awayForm ?? ['W', 'D', 'W', 'L', 'W'],
    homeAttack: 1.4,
    awayAttack: 1.1,
    homeDefense: 0.9,
    awayDefense: 1.2,
    homeStrength: 1.3,
    awayStrength: 1.05,
    restDaysHome: 3,
    restDaysAway: 4,
    injuryImpactHome: 0,
    injuryImpactAway: 0,
    squadChangeHome: 0,
    squadChangeAway: 0,
    dataCompleteness: 0.8,
    ratings: null,
  };

  return {
    match,
    competition,
    homeTeam,
    awayTeam,
    featureSnapshot,
    dataCutoffAt: featureSnapshot.dataCutoffAt,
  };
}

describe('hasMinimumPredictionData', () => {
  it('returns true when required identity, form, and strength exist', () => {
    // Arrange
    const context = buildContext();

    // Act
    const result = hasMinimumPredictionData(context);

    // Assert
    expect(result).toBe(true);
  });

  it('returns false when recent form is missing', () => {
    // Arrange
    const context = buildContext({ homeForm: [], awayForm: [] });

    // Act
    const result = hasMinimumPredictionData(context);

    // Assert
    expect(result).toBe(false);
  });
});
