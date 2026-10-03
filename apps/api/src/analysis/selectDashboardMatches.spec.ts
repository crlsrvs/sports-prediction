import { describe, expect, it } from 'vitest';
import {
  asCompetitionId,
  asDataSourceId,
  asMatchId,
  asSportId,
  asTeamId,
  type Match,
  type MatchStatus,
} from '@sports-prediction/domain';
import { selectDashboardMatches } from './selectDashboardMatches.js';

const NOW = new Date('2026-10-02T20:00:00Z');

function match(
  id: string,
  scheduledAt: string,
  options: { source?: string; status?: MatchStatus; competition?: string } = {},
): Match {
  return {
    id: asMatchId(id),
    sportId: asSportId('sport-football'),
    competitionId: asCompetitionId(options.competition ?? 'comp-pl'),
    seasonId: null,
    homeTeamId: asTeamId('a'),
    awayTeamId: asTeamId('b'),
    scheduledAt: new Date(scheduledAt),
    venueId: null,
    status: options.status ?? 'scheduled',
    homeScore: null,
    awayScore: null,
    sourceId: asDataSourceId(options.source ?? 'source-football-data'),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('selectDashboardMatches', () => {
  it("shows today's real fixtures when there are any", () => {
    // Arrange
    const matches = [
      match('today', '2026-10-02T14:00:00Z'),
      match('next-week', '2026-10-10T11:30:00Z'),
      match('seed-today', '2026-10-02T18:00:00Z', { source: 'source-seed' }),
    ];

    // Act
    const result = selectDashboardMatches(matches, NOW);

    // Assert
    expect(result.map((m) => m.id)).toEqual(['today']);
  });

  it('falls back to the next upcoming matchday window', () => {
    // Arrange
    const matches = [
      match('played', '2026-09-20T15:30:00Z', { status: 'finished' }),
      match('sat', '2026-10-10T11:30:00Z'),
      match('sun', '2026-10-11T15:00:00Z'),
      match('ucl', '2026-10-13T19:00:00Z', { competition: 'comp-ucl' }),
      match('far', '2026-10-24T14:00:00Z'),
    ];

    // Act
    const result = selectDashboardMatches(matches, NOW);

    // Assert
    expect(result.map((m) => m.id)).toEqual(['sat', 'sun', 'ucl']);
  });

  it('shows the latest played matchday when nothing is scheduled', () => {
    // Arrange
    const matches = [
      match('old', '2025-04-01T15:00:00Z', { status: 'finished' }),
      match('last-1', '2025-05-23T19:00:00Z', { status: 'finished' }),
      match('last-2', '2025-05-25T15:00:00Z', { status: 'finished' }),
    ];

    // Act
    const result = selectDashboardMatches(matches, NOW);

    // Assert
    expect(result.map((m) => m.id)).toEqual(['last-1', 'last-2']);
  });

  it("uses today's seed matches only when no real data exists", () => {
    // Arrange
    const matches = [
      match('seed-today', '2026-10-02T18:00:00Z', { source: 'source-seed' }),
      match('seed-tomorrow', '2026-10-03T18:00:00Z', { source: 'source-seed' }),
    ];

    // Act
    const result = selectDashboardMatches(matches, NOW);

    // Assert
    expect(result.map((m) => m.id)).toEqual(['seed-today']);
  });
});
