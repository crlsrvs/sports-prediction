import { describe, expect, it } from 'vitest';
import {
  asCompetitionId,
  asMatchId,
  asSportId,
  asTeamId,
  type Match,
} from '@sports-prediction/domain';
import { buildFeatureSnapshot } from './buildFeatureSnapshot.js';

function match(
  id: string,
  home: string,
  away: string,
  when: string,
): Match {
  const now = new Date(when);
  return {
    id: asMatchId(id),
    sportId: asSportId('football'),
    competitionId: asCompetitionId('pl'),
    seasonId: null,
    homeTeamId: asTeamId(home),
    awayTeamId: asTeamId(away),
    scheduledAt: now,
    venueId: null,
    status: 'finished',
    homeScore: null,
    awayScore: null,
    sourceId: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('buildFeatureSnapshot', () => {
  it('uses only history before the data cutoff', () => {
    // Arrange
    const home = asTeamId('home');
    const away = asTeamId('away');
    const history = [
      {
        match: match('h1', 'home', 'x', '2026-09-20T12:00:00.000Z'),
        homeScore: 2,
        awayScore: 0,
      },
      {
        match: match('h2', 'y', 'away', '2026-09-21T12:00:00.000Z'),
        homeScore: 1,
        awayScore: 1,
      },
    ];

    // Act
    const snapshot = buildFeatureSnapshot({
      matchId: asMatchId('m1'),
      homeTeamId: home,
      awayTeamId: away,
      matchScheduledAt: new Date('2026-10-02T14:00:00.000Z'),
      dataCutoffAt: new Date('2026-10-02T13:55:00.000Z'),
      history,
    });

    // Assert
    expect(snapshot.homeForm).toEqual(['W']);
    expect(snapshot.awayForm).toEqual(['D']);
    expect(snapshot.homeAttack).toBeGreaterThan(0);
  });
});
