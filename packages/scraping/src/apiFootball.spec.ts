import { describe, expect, it, vi } from 'vitest';
import {
  ApiFootballAdapter,
  currentFootballSeason,
  mapApiStatusToMatchStatus,
  resolveApiFootballSeason,
} from './apiFootball.js';


describe('ApiFootballAdapter', () => {
  it('builds date-only fixture URLs for free-plan queries', () => {
    // Arrange
    const adapter = new ApiFootballAdapter({ apiKey: 'test-key' });

    // Act
    const url = adapter.buildFixturesByDateUrl('2026-10-02');

    // Assert
    expect(url).toContain('/fixtures');
    expect(url).toContain('date=2026-10-02');
    expect(url).not.toContain('season=');
  });

  it('pings using injected fetch without hitting the network', async () => {
    // Arrange
    const fetchImpl = vi.fn<
      (input: string | URL, init?: RequestInit) => Promise<Response>
    >(async () => {
      return new Response(
        JSON.stringify({
          results: 1,
          response: [
            {
              league: { id: 39, name: 'Premier League', season: 2024 },
              fixture: { id: 1, date: '2026-10-02T12:00:00Z', status: { short: 'NS' } },
              teams: {
                home: { id: 1, name: 'A' },
                away: { id: 2, name: 'B' },
              },
              goals: { home: null, away: null },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });
    const adapter = new ApiFootballAdapter({
      apiKey: 'test-key',
      fetchImpl,
    });

    // Act
    const result = await adapter.ping();

    // Assert
    expect(result).toEqual({ ok: true, results: 1 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-apisports-key': 'test-key',
    });
  });

  it('maps fixture statuses to domain match statuses', () => {
    // Arrange / Act / Assert
    expect(mapApiStatusToMatchStatus('FT')).toBe('finished');
    expect(mapApiStatusToMatchStatus('NS')).toBe('scheduled');
    expect(mapApiStatusToMatchStatus('1H')).toBe('live');
    expect(mapApiStatusToMatchStatus('PST')).toBe('postponed');
  });

  it('computes football season across mid-year boundary', () => {
    // Arrange / Act / Assert
    expect(currentFootballSeason(new Date('2026-03-01T00:00:00Z'))).toBe(2025);
    expect(currentFootballSeason(new Date('2026-08-01T00:00:00Z'))).toBe(2026);
  });

  it('clamps free-plan seasons and honors API_FOOTBALL_SEASON', () => {
    // Arrange / Act / Assert
    expect(
      resolveApiFootballSeason(new Date('2026-10-02T00:00:00Z'), {}),
    ).toBe(2024);
    expect(
      resolveApiFootballSeason(new Date('2026-10-02T00:00:00Z'), {
        API_FOOTBALL_SEASON: '2023',
      }),
    ).toBe(2023);
  });
});
