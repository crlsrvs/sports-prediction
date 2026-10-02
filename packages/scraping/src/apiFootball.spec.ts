import { describe, expect, it, vi } from 'vitest';
import {
  ApiFootballAdapter,
  currentFootballSeason,
  mapApiStatusToMatchStatus,
} from './apiFootball.js';

describe('ApiFootballAdapter', () => {
  it('builds fixtures URLs with league, date and season', () => {
    // Arrange
    const adapter = new ApiFootballAdapter({ apiKey: 'test-key' });

    // Act
    const url = adapter.buildFixturesUrl({
      date: '2026-10-02',
      leagueId: 39,
      season: 2026,
    });

    // Assert
    expect(url).toContain('/fixtures');
    expect(url).toContain('date=2026-10-02');
    expect(url).toContain('league=39');
    expect(url).toContain('season=2026');
  });

  it('pings using injected fetch without hitting the network', async () => {
    // Arrange
    const fetchImpl = vi.fn<
      (input: string | URL, init?: RequestInit) => Promise<Response>
    >(async () => {
      return new Response(
        JSON.stringify({
          results: 2,
          response: [{}, {}],
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
    expect(result).toEqual({ ok: true, results: 2 });
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
});
