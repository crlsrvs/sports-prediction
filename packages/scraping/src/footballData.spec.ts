import { describe, expect, it, vi } from 'vitest';
import {
  FootballDataAdapter,
  createFootballDataAdapterFromEnv,
  mapFootballDataStatus,
  type FootballDataMatch,
} from './footballData.js';

function sampleMatch(overrides: Partial<FootballDataMatch> = {}): FootballDataMatch {
  return {
    id: 560542,
    utcDate: '2026-08-21T19:00:00Z',
    status: 'FINISHED',
    competition: { id: 2021, code: 'PL', name: 'Premier League' },
    season: { id: 2502, startDate: '2026-08-21', endDate: '2027-05-30' },
    homeTeam: { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS' },
    awayTeam: { id: 1076, name: 'Coventry City FC', shortName: 'Coventry City', tla: 'COV' },
    score: { winner: 'HOME_TEAM', fullTime: { home: 3, away: 0 } },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('FootballDataAdapter', () => {
  it('sends the auth header and parses competition matches', async () => {
    // Arrange
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        headers: (init?.headers as Record<string, string> | undefined) ?? {},
      });
      return jsonResponse({ matches: [sampleMatch()] });
    });
    const adapter = new FootballDataAdapter({ apiKey: 'secret', fetchImpl });

    // Act
    const result = await adapter.fetchCompetitionMatches({ code: 'PL', season: 2026 });

    // Assert
    expect(calls[0]?.url).toBe(
      'https://api.football-data.org/v4/competitions/PL/matches?season=2026',
    );
    expect(calls[0]?.headers['X-Auth-Token']).toBe('secret');
    expect(result.matches).toHaveLength(1);
    expect(result.raw.metadata['provider']).toBe('football-data');
  });

  it('collects per-competition warnings instead of failing the whole run', async () => {
    // Arrange: first competition rate-limited, the rest fine
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse({ message: 'Too many requests' }, 429)
        : jsonResponse({ matches: [sampleMatch({ id: 1000 + calls })] });
    });
    const adapter = new FootballDataAdapter({ apiKey: 'k', fetchImpl });

    // Act
    const result = await adapter.fetchTrackedCompetitions();

    // Assert
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('rate limit');
    expect(result.matches).toHaveLength(5);
  });

  it('surfaces the provider message on auth errors', async () => {
    // Arrange
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ message: 'Your API token is invalid.', errorCode: 400 }, 400),
    );
    const adapter = new FootballDataAdapter({ apiKey: 'bad', fetchImpl });

    // Act & Assert
    await expect(adapter.fetchCompetitionMatches({ code: 'PL' })).rejects.toThrow(
      /HTTP 400: Your API token is invalid/,
    );
  });

  it('is created only when FOOTBALL_DATA_KEY is set', () => {
    // Arrange & Act
    const missing = createFootballDataAdapterFromEnv({});
    const present = createFootballDataAdapterFromEnv({ FOOTBALL_DATA_KEY: ' k ' });

    // Assert
    expect(missing).toBeNull();
    expect(present).toBeInstanceOf(FootballDataAdapter);
  });
});

describe('mapFootballDataStatus', () => {
  it('maps provider statuses onto the domain', () => {
    // Arrange
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['FINISHED', 'finished'],
      ['TIMED', 'scheduled'],
      ['SCHEDULED', 'scheduled'],
      ['IN_PLAY', 'live'],
      ['PAUSED', 'live'],
      ['POSTPONED', 'postponed'],
      ['SUSPENDED', 'postponed'],
      ['CANCELLED', 'cancelled'],
      ['AWARDED', 'cancelled'],
      ['SOMETHING_NEW', 'scheduled'],
    ];

    // Act & Assert
    for (const [input, expected] of cases) {
      expect(mapFootballDataStatus(input)).toBe(expected);
    }
  });
});
