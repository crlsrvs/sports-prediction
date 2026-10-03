import { describe, expect, it } from 'vitest';
import type { Match } from '@sports-prediction/domain';
import {
  asCompetitionId,
  asDataSourceId,
  asMatchId,
  asSportId,
  asTeamId,
} from '@sports-prediction/domain';
import { API_FOOTBALL_SOURCE_ID, SEED_SOURCE_ID } from '@sports-prediction/shared';
import { buildFinishedHistory } from './history.js';

function match(id: string, sourceId: string, status: Match['status'], day: number): Match {
  const at = new Date(Date.UTC(2025, 0, day));
  return {
    id: asMatchId(id),
    sportId: asSportId('football'),
    competitionId: asCompetitionId('comp'),
    seasonId: null,
    homeTeamId: asTeamId('a'),
    awayTeamId: asTeamId('b'),
    scheduledAt: at,
    venueId: null,
    status,
    homeScore: status === 'finished' ? 1 : null,
    awayScore: status === 'finished' ? 0 : null,
    sourceId: asDataSourceId(sourceId),
    createdAt: at,
    updatedAt: at,
  };
}

describe('buildFinishedHistory', () => {
  it('keeps seed results while no real data exists', () => {
    // Arrange
    const matches = [match('s1', SEED_SOURCE_ID, 'finished', 2), match('s2', SEED_SOURCE_ID, 'scheduled', 3)];

    // Act
    const history = buildFinishedHistory(matches);

    // Assert
    expect(history.map((item) => String(item.match.id))).toEqual(['s1']);
  });

  it('drops seed results once real provider data is present and sorts by kickoff', () => {
    // Arrange
    const matches = [
      match('seed', SEED_SOURCE_ID, 'finished', 9),
      match('real-late', API_FOOTBALL_SOURCE_ID, 'finished', 5),
      match('real-early', API_FOOTBALL_SOURCE_ID, 'finished', 1),
    ];

    // Act
    const history = buildFinishedHistory(matches);

    // Assert
    expect(history.map((item) => String(item.match.id))).toEqual(['real-early', 'real-late']);
  });
});
