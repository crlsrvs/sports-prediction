import { describe, expect, it } from 'vitest';
import {
  asCompetitionId,
  asSportId,
  asTeamId,
  type Competition,
  type Team,
} from '@sports-prediction/domain';
import type { ApiFootballFixtureItem } from './apiFootball.js';
import { ingestApiFootballFixtures } from './ingestFixtures.js';

const sportId = asSportId('sport-football');

const competitions: Competition[] = [
  {
    id: asCompetitionId('comp-pl'),
    sportId,
    name: 'Premier League',
    country: 'England',
    active: true,
  },
];

const teams: Team[] = [
  {
    id: asTeamId('team-liverpool'),
    sportId,
    canonicalName: 'Liverpool',
    aliases: ['Liverpool FC'],
  },
];

function fixture(overrides?: Partial<ApiFootballFixtureItem>): ApiFootballFixtureItem {
  return {
    fixture: {
      id: 1001,
      date: '2026-10-02T15:00:00+00:00',
      status: { short: 'NS' },
    },
    league: {
      id: 39,
      name: 'Premier League',
      season: 2026,
    },
    teams: {
      home: { id: 40, name: 'Liverpool' },
      away: { id: 50, name: 'Manchester City' },
    },
    goals: { home: null, away: null },
    ...overrides,
  };
}

describe('ingestApiFootballFixtures', () => {
  it('matches known aliases and creates provider teams for unknowns', () => {
    // Arrange
    const fixtures = [fixture()];

    // Act
    const result = ingestApiFootballFixtures({
      fixtures,
      teams,
      competitions,
      now: new Date('2026-10-02T12:00:00Z'),
    });

    // Assert
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.matches[0]?.homeTeamId).toBe('team-liverpool');
    expect(String(result.matches[0]?.awayTeamId)).toContain('team-af-');
    expect(result.unresolvedNames).toContain('Manchester City');
  });

  it('skips fixtures from unsupported leagues', () => {
    // Arrange
    const fixtures = [
      fixture({
        league: { id: 999, name: 'Unknown', season: 2026 },
      }),
    ];

    // Act
    const result = ingestApiFootballFixtures({
      fixtures,
      teams,
      competitions,
    });

    // Assert
    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
  });
});
