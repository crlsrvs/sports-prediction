import { asDataSourceId } from '@sports-prediction/domain';
import { API_FOOTBALL_SOURCE_ID } from '@sports-prediction/shared';
import { checksumPayload } from './checksum.js';
import { TRACKED_COMPETITIONS } from './competitions.js';
import type { RawScrape, SourceAdapter } from './types.js';

export const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io';

/** Free API-Football plans currently expose historical seasons up to this year. */
export const API_FOOTBALL_FREE_MAX_SEASON = 2024;

/** API-Football league ids for every competition we ingest. */
export const API_FOOTBALL_LEAGUES = {
  ucl: 2,
  premierLeague: 39,
  laLiga: 140,
  bundesliga: 78,
  serieA: 135,
  ligue1: 61,
} as const;

/** Leagues surfaced in the product (dashboard, daily scrape filter). */
export const MVP_LEAGUE_IDS: ReadonlySet<number> = new Set(
  TRACKED_COMPETITIONS.filter((item) => item.role === 'featured').map(
    (item) => item.apiFootballLeagueId,
  ),
);

/** Every league ingested for modelling, featured or support. */
export const TRACKED_LEAGUE_IDS: ReadonlySet<number> = new Set(
  TRACKED_COMPETITIONS.map((item) => item.apiFootballLeagueId),
);

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

  buildInjuriesUrl(leagueId: number, season: number): string {
    const url = new URL(`${this.baseUrl}/injuries`);
    url.searchParams.set('league', String(leagueId));
    url.searchParams.set('season', String(season));
    return url.toString();
  }

  buildFixturesByDateUrl(date: string): string {
    const url = new URL(`${this.baseUrl}/fixtures`);
    url.searchParams.set('date', date);
    return url.toString();
  }

  buildFixturesUrl(input: {
    readonly date?: string;
    readonly leagueId: number;
    readonly season: number;
    readonly next?: number;
    readonly last?: number;
  }): string {
    const url = new URL(`${this.baseUrl}/fixtures`);
    url.searchParams.set('league', String(input.leagueId));
    url.searchParams.set('season', String(input.season));
    if (input.date) url.searchParams.set('date', input.date);
    if (input.next !== undefined) url.searchParams.set('next', String(input.next));
    if (input.last !== undefined) url.searchParams.set('last', String(input.last));
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

  private parseFixturesPayload(scrape: RawScrape): readonly ApiFootballFixtureItem[] {
    if (scrape.statusCode < 200 || scrape.statusCode >= 300) {
      throw new Error(`API-Football fixtures failed (${scrape.statusCode})`);
    }
    const parsed = JSON.parse(scrape.payload) as ApiFootballFixturesResponse;
    if (parsed.errors && Object.keys(parsed.errors as object).length > 0) {
      throw new Error(`API-Football error: ${JSON.stringify(parsed.errors)}`);
    }
    return parsed.response;
  }

  /**
   * Full-season fixtures for one league. Free plans allow this for seasons 2022–2024,
   * which is the main way to obtain real historical data without a paid plan.
   */
  async fetchSeasonFixtures(input: {
    readonly leagueId: number;
    readonly season: number;
  }): Promise<{
    readonly raw: RawScrape;
    readonly fixtures: readonly ApiFootballFixtureItem[];
  }> {
    const url = this.buildFixturesUrl({
      leagueId: input.leagueId,
      season: input.season,
    });
    const raw = await this.fetch({ url });
    const fixtures = this.parseFixturesPayload(raw);
    return { raw, fixtures };
  }

  /**
   * Fetches full seasons for every tracked league (featured + support),
   * collecting warnings per league instead of failing the whole run.
   */
  async fetchMvpSeason(season: number): Promise<{
    readonly raw: readonly RawScrape[];
    readonly fixtures: readonly ApiFootballFixtureItem[];
    readonly warnings: readonly string[];
  }> {
    const raw: RawScrape[] = [];
    const fixtures: ApiFootballFixtureItem[] = [];
    const warnings: string[] = [];
    for (const leagueId of TRACKED_LEAGUE_IDS) {
      try {
        const result = await this.fetchSeasonFixtures({ leagueId, season });
        raw.push(result.raw);
        fixtures.push(...result.fixtures);
      } catch (error) {
        warnings.push(
          `league ${leagueId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { raw, fixtures, warnings };
  }

  /**
   * Free plans can query a narrow date window via `?date=` (without season/last/next).
   * We fetch the day and keep only MVP leagues (PL / UCL / La Liga).
   */
  async fetchTodaysFixtures(input: {
    readonly date: string;
    readonly season: number;
  }): Promise<{
    readonly raw: readonly RawScrape[];
    readonly fixtures: readonly ApiFootballFixtureItem[];
    readonly warnings: readonly string[];
  }> {
    void input.season;
    const warnings: string[] = [];
    const url = this.buildFixturesByDateUrl(input.date);
    const scrape = await this.fetch({ url });
    const all = this.parseFixturesPayload(scrape);
    const fixtures = all.filter((item) => MVP_LEAGUE_IDS.has(item.league.id));

    if (fixtures.length === 0) {
      warnings.push(
        `No MVP fixtures (PL/UCL/La Liga) on ${input.date}. Free plans cannot use last/next or other dates.`,
      );
    }

    return { raw: [scrape], fixtures, warnings };
  }

  async ping(): Promise<{ readonly ok: boolean; readonly results: number }> {
    const today = new Date().toISOString().slice(0, 10);
    const url = this.buildFixturesByDateUrl(today);
    const scrape = await this.fetch({ url });
    if (scrape.statusCode < 200 || scrape.statusCode >= 300) {
      return { ok: false, results: 0 };
    }
    const parsed = JSON.parse(scrape.payload) as ApiFootballFixturesResponse;
    if (parsed.errors && Object.keys(parsed.errors as object).length > 0) {
      return { ok: false, results: 0 };
    }
    const mvp = (parsed.response ?? []).filter((item) =>
      MVP_LEAGUE_IDS.has(item.league.id),
    );
    return {
      ok: true,
      results: mvp.length > 0 ? mvp.length : (parsed.results ?? parsed.response.length),
    };
  }
}

/** Football seasons typically start in July/August. */
export function currentFootballSeason(now: Date): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  return month >= 6 ? year : year - 1;
}

/**
 * Resolves the season used for API-Football requests.
 * Free plans reject seasons above 2024; override with API_FOOTBALL_SEASON.
 */
export function resolveApiFootballSeason(
  now: Date,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const configured = env['API_FOOTBALL_SEASON']?.trim();
  if (configured) {
    const parsed = Number(configured);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return Math.min(currentFootballSeason(now), API_FOOTBALL_FREE_MAX_SEASON);
}

/** Maps YYYY-MM-DD onto another season year (keeps month/day). */
export function mapDateToSeason(dateIso: string, season: number): string {
  const [, month = '01', day = '01'] = dateIso.split('-');
  return `${season}-${month}-${day}`;
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
