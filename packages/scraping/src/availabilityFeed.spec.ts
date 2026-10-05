import { describe, expect, it } from 'vitest';
import { asSportId, asTeamId, type Team } from '@sports-prediction/domain';
import {
  injuriesToAbsences,
  lineupsFromFootballDataMatches,
  parseApiFootballInjuries,
} from './availabilityFeed.js';
import type { FootballDataMatch } from './footballData.js';

const team: Team = {
  id: asTeamId('team-af-42'),
  sportId: asSportId('sport-football'),
  canonicalName: 'Arsenal',
  aliases: [],
};

describe('parseApiFootballInjuries', () => {
  it('reads player, team and fixture date and skips incomplete rows', () => {
    // Arrange
    const payload = JSON.stringify({
      errors: [],
      response: [
        {
          player: { name: 'Bukayo Saka', reason: 'Knee Injury' },
          team: { id: 42 },
          fixture: { date: '2026-10-09T19:00:00Z' },
        },
        { player: { name: '' }, team: { id: 42 }, fixture: { date: '2026-10-09T19:00:00Z' } },
      ],
    });

    // Act
    const parsed = parseApiFootballInjuries(payload);

    // Assert
    expect(parsed.error).toBeNull();
    expect(parsed.injuries).toEqual([
      {
        providerTeamId: 42,
        playerName: 'Bukayo Saka',
        reason: 'Knee Injury',
        matchDay: new Date('2026-10-09T19:00:00Z'),
      },
    ]);
  });

  it('reports a provider error without throwing', () => {
    // Arrange
    const payload = JSON.stringify({ errors: { plan: 'This season is not available' } });

    // Act
    const parsed = parseApiFootballInjuries(payload);

    // Assert
    expect(parsed.injuries).toEqual([]);
    expect(parsed.error).toContain('not available');
  });
});

describe('injuriesToAbsences', () => {
  it('keeps injuries whose team already exists and drops the rest', () => {
    // Arrange
    const injuries = [
      {
        providerTeamId: 42,
        playerName: 'Bukayo Saka',
        reason: 'Knee Injury',
        matchDay: new Date('2026-10-09T19:00:00Z'),
      },
      {
        providerTeamId: 99,
        playerName: 'Unknown',
        reason: 'Ill',
        matchDay: new Date('2026-10-09T19:00:00Z'),
      },
    ];

    // Act
    const absences = injuriesToAbsences({ injuries, teams: [team], aliases: [] });

    // Assert
    expect(absences.map((item) => item.teamId)).toEqual([team.id]);
  });
});

describe('lineupsFromFootballDataMatches', () => {
  it('extracts named starters and ignores matches without a lineup', () => {
    // Arrange
    const match = {
      id: 1,
      utcDate: '2026-10-04T14:00:00Z',
      status: 'FINISHED',
      competition: { id: 2021, code: 'PL', name: 'Premier League' },
      season: { id: 1, startDate: '2026-08-01', endDate: '2027-05-31' },
      homeTeam: { id: 57, name: 'Arsenal', shortName: 'Arsenal', tla: 'ARS', lineup: [{ name: 'Saka' }, { name: '  ' }] },
      awayTeam: { id: 65, name: 'Leeds', shortName: 'Leeds', tla: 'LEE' },
      score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } },
    } as FootballDataMatch;

    // Act
    const lineups = lineupsFromFootballDataMatches([match], [team], [
      { alias: 'football-data:57', teamId: team.id },
    ]);

    // Assert
    expect(lineups).toEqual([
      {
        teamId: team.id,
        matchDay: new Date('2026-10-04T14:00:00Z'),
        playerNames: ['Saka'],
      },
    ]);
  });
});
