import { asDataSourceId } from '@sports-prediction/domain';
import { API_FOOTBALL_SOURCE_ID } from '@sports-prediction/shared';
import { checksumPayload } from './checksum.js';
import type { RawScrape, SourceAdapter } from './types.js';

export const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io';

/** API-Football league ids for MVP competitions. */
export const API_FOOTBALL_LEAGUES = {
  ucl: 2,
  premierLeague: 39,
  laLiga: 140,
} as const;

export type ApiFootballFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ApiFootballFixtureTeam {
  readonly id: number;
  readonly name: string;
}

export interface ApiFootballFixtureItem {
  readonly fixture: {
    readonly id: number;
    readonly date: string;
    readonly status: { readonly short: string };
  };
  readonly league: {
    readonly id: number;
    readonly name: string;
    readonly season: number;
  };
  readonly teams: {
    readonly home: ApiFootballFixtureTeam;
    readonly away: ApiFootballFixtureTeam;
  };
  readonly goals: {
    readonly home: number | null;
    readonly away: number | null;
  };
}

export interface ApiFootballFixturesResponse {
  readonly results: number;
  readonly response: readonly ApiFootballFixtureItem[];
  readonly errors?: unknown;
}

export interface ApiFootballAdapterOptions {
  readonly apiKey: string;
  readonly fetchImpl?: ApiFootballFetch;
  readonly baseUrl?: string;
}

export class ApiFootballAdapter implements SourceAdapter {
  readonly id = asDataSourceId(API_FOOTBALL_SOURCE_ID);
  readonly kind = 'api' as const;
  readonly name = 'API-Football';

  private readonly apiKey: string;
  private readonly fetchImpl: ApiFootballFetch;
  private readonly baseUrl: string;

  constructor(options: ApiFootballAdapterOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? API_FOOTBALL_BASE_URL;
  }

  async fetch(input: { readonly url: string }): Promise<RawScrape> {
    const response = await this.fetchImpl(input.url, {
      headers: {
        'x-apisports-key': this.apiKey,
        Accept: 'application/json',
      },
    });
    const payload = await response.text();
    return {
      sourceId: this.id,
      url: input.url,
      fetchedAt: new Date(),
      statusCode: response.status,
      contentType: response.headers.get('content-type'),
      payload,
      checksum: checksumPayload(payload),
      metadata: {
        provider: 'api-football',
      },
    };
  }

  buildFixturesUrl(input: {
    readonly date: string;
    readonly leagueId: number;
    readonly season: number;
  }): string {
    const url = new URL(`${this.baseUrl}/fixtures`);
    url.searchParams.set('date', input.date);
    url.searchParams.set('league', String(input.leagueId));
    url.searchParams.set('season', String(input.season));
    return url.toString();
  }

  buildTeamFixturesUrl(input: {
    readonly teamId: number;
    readonly season: number;
    readonly last?: number;
  }): string {
    const url = new URL(`${this.baseUrl}/fixtures`);
    url.searchParams.set('team', String(input.teamId));
    url.searchParams.set('season', String(input.season));
    url.searchParams.set('last', String(input.last ?? 10));
    return url.toString();
  }

  async fetchTodaysFixtures(input: {
    readonly date: string;
    readonly season: number;
  }): Promise<{
    readonly raw: readonly RawScrape[];
    readonly fixtures: readonly ApiFootballFixtureItem[];
  }> {
    const leagueIds = Object.values(API_FOOTBALL_LEAGUES);
    const raw: RawScrape[] = [];
    const fixtures: ApiFootballFixtureItem[] = [];

    for (const leagueId of leagueIds) {
      const url = this.buildFixturesUrl({
        date: input.date,
        leagueId,
        season: input.season,
      });
      const scrape = await this.fetch({ url });
      raw.push(scrape);
      if (scrape.statusCode < 200 || scrape.statusCode >= 300) {
        throw new Error(
          `API-Football fixtures failed (${scrape.statusCode}) for league ${leagueId}`,
        );
      }
      const parsed = JSON.parse(scrape.payload) as ApiFootballFixturesResponse;
      if (parsed.errors && Object.keys(parsed.errors as object).length > 0) {
        throw new Error(
          `API-Football error for league ${leagueId}: ${JSON.stringify(parsed.errors)}`,
        );
      }
      fixtures.push(...parsed.response);
    }

    return { raw, fixtures };
  }

  async ping(): Promise<{ readonly ok: boolean; readonly results: number }> {
    const today = new Date().toISOString().slice(0, 10);
    const season = currentFootballSeason(new Date());
    const url = this.buildFixturesUrl({
      date: today,
      leagueId: API_FOOTBALL_LEAGUES.premierLeague,
      season,
    });
    const scrape = await this.fetch({ url });
    if (scrape.statusCode < 200 || scrape.statusCode >= 300) {
      return { ok: false, results: 0 };
    }
    const parsed = JSON.parse(scrape.payload) as ApiFootballFixturesResponse;
    return { ok: true, results: parsed.results ?? parsed.response.length };
  }
}

/** Football seasons typically start in July/August. */
export function currentFootballSeason(now: Date): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  return month >= 6 ? year : year - 1;
}

export function mapApiStatusToMatchStatus(
  short: string,
): 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled' {
  const normalized = short.toUpperCase();
  if (['FT', 'AET', 'PEN'].includes(normalized)) return 'finished';
  if (['NS', 'TBD'].includes(normalized)) return 'scheduled';
  if (['PST', 'SUSP'].includes(normalized)) return 'postponed';
  if (['CANC', 'ABD', 'AWD', 'WO'].includes(normalized)) return 'cancelled';
  return 'live';
}

export function createApiFootballAdapterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: ApiFootballFetch,
): ApiFootballAdapter | null {
  const apiKey = env['API_FOOTBALL_KEY']?.trim();
  if (!apiKey) return null;
  return new ApiFootballAdapter(
    fetchImpl ? { apiKey, fetchImpl } : { apiKey },
  );
}
