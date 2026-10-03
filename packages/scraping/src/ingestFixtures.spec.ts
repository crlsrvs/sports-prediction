import { describe, expect, it } from 'vitest';
import {
  asCompetitionId,
  asSportId,
  asTeamId,
  type Competition,
  type Team,
} from '@sports-prediction/domain';
import type { ApiFootballFixtureItem } from './apiFootball.js';
import type { FootballDataMatch } from './footballData.js';
import {
  ingestApiFootballFixtures,
  ingestFootballDataMatches,
} from './ingestFixtures.js';

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
    expect(result.unresolvedTeams).toEqual([
      { name: 'Manchester City', teamId: result.matches[0]?.awayTeamId },
    ]);
  });

  it('prefers the provider id alias over name matching', () => {
    // Arrange: a canonical team that already absorbed the provider id
    const merged: Team = {
      id: asTeamId('team-man-city'),
      sportId: asSportId('sport-football'),
      canonicalName: 'Manchester City',
      aliases: ['api-football:50'],
    };
    const fixtures = [
      fixture({
        teams: {
          home: { id: 40, name: 'Liverpool' },
          away: { id: 50, name: 'Man City (renamed)' },
        },
      }),
    ];

    // Act
    const result = ingestApiFootballFixtures({
      fixtures,
      teams: [...teams, merged],
      competitions,
    });

    // Assert
    expect(result.matches[0]?.awayTeamId).toBe('team-man-city');
    expect(result.unresolvedTeams).toHaveLength(0);
    expect(result.teamsToUpsert.map((team) => team.id)).not.toContain('team-man-city');
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

describe('ingestFootballDataMatches', () => {
  const fdMatch: FootballDataMatch = {
    id: 560542,
    utcDate: '2026-10-02T19:00:00Z',
    status: 'TIMED',
    competition: { id: 2021, code: 'PL', name: 'Premier League' },
    season: { id: 2502, startDate: '2026-08-21', endDate: '2027-05-30' },
    homeTeam: { id: 64, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV' },
    awayTeam: { id: 65, name: 'Manchester City FC', shortName: 'Man City', tla: 'MCI' },
    score: { winner: null, fullTime: { home: null, away: null } },
  };

  it('resolves teams via short names and tags them with the provider alias', () => {
    // Arrange
    const manCity: Team = {
      id: asTeamId('team-man-city'),
      sportId,
      canonicalName: 'Manchester City',
      aliases: ['Man City'],
    };

    // Act
    const result = ingestFootballDataMatches({
      matches: [fdMatch],
      teams: [...teams, manCity],
      competitions,
    });

    // Assert
    const match = result.matches[0];
    expect(String(match?.id)).toBe('match-fd-560542');
    expect(String(match?.sourceId)).toBe('source-football-data');
    expect(match?.homeTeamId).toBe('team-liverpool');
    expect(match?.awayTeamId).toBe('team-man-city');
    expect(match?.homeScore).toBeNull();
    const liverpool = result.teamsToUpsert.find((team) => team.id === 'team-liverpool');
    expect(liverpool?.aliases).toEqual(
      expect.arrayContaining(['Liverpool FC', 'football-data:64']),
    );
    expect(result.unresolvedTeams).toHaveLength(0);
  });

  it('updates a match already imported from another provider instead of duplicating it', () => {
    // Arrange
    const existing = ingestApiFootballFixtures({
      fixtures: [
        fixture({
          fixture: { id: 1001, date: '2026-10-02T19:00:00+00:00', status: { short: 'NS' } },
        }),
      ],
      teams,
      competitions,
    });
    const knownTeams = [...teams, ...existing.teamsToUpsert.filter((t) => t.id !== 'team-liverpool')];
    const finished: FootballDataMatch = {
      ...fdMatch,
      status: 'FINISHED',
      awayTeam: { id: 65, name: 'Manchester City', shortName: 'Man City', tla: 'MCI' },
      score: { winner: 'AWAY_TEAM', fullTime: { home: 1, away: 2 } },
    };

    // Act
    const result = ingestFootballDataMatches({
      matches: [finished],
      teams: knownTeams,
      competitions,
      existingMatches: existing.matches,
    });

    // Assert
    expect(result.deduplicated).toBe(1);
    const match = result.matches[0];
    expect(String(match?.id)).toBe('match-af-1001');
    expect(String(match?.sourceId)).toBe('source-api-football');
    expect(match?.status).toBe('finished');
    expect(match?.homeScore).toBe(1);
    expect(match?.awayScore).toBe(2);
  });
});
