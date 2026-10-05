import { asDataSourceId, type MatchStatus } from '@sports-prediction/domain';
import { FOOTBALL_DATA_SOURCE_ID } from '@sports-prediction/shared';
import { checksumPayload } from './checksum.js';
import { TRACKED_COMPETITIONS } from './competitions.js';
import type { RawScrape, SourceAdapter } from './types.js';

export const FOOTBALL_DATA_BASE_URL = 'https://api.football-data.org/v4';

/** Free tier: 10 requests per minute. One request per tracked competition fits. */
export const FOOTBALL_DATA_REQUESTS_PER_MINUTE = 10;

export type FootballDataFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface FootballDataTeam {
  readonly id: number;
  readonly name: string;
  readonly shortName: string | null;
  readonly tla: string | null;
  /** Present only when the provider includes it. The season list usually omits it. */
  readonly lineup?: readonly { readonly name?: string | null }[] | null;
}

export interface FootballDataMatch {
  readonly id: number;
  readonly utcDate: string;
  readonly status: string;
  readonly competition: {
    readonly id: number;
    readonly code: string;
    readonly name: string;
  };
  readonly season: {
    readonly id: number;
    readonly startDate: string;
    readonly endDate: string;
  };
  readonly homeTeam: FootballDataTeam;
  readonly awayTeam: FootballDataTeam;
  readonly score: {
    readonly winner: string | null;
    readonly fullTime: {
      readonly home: number | null;
      readonly away: number | null;
    };
  };
}

export interface FootballDataMatchesResponse {
  readonly resultSet?: { readonly count: number };
  readonly matches: readonly FootballDataMatch[];
  readonly message?: string;
  readonly errorCode?: number;
}

export interface FootballDataAdapterOptions {
  readonly apiKey: string;
  readonly fetchImpl?: FootballDataFetch;
  readonly baseUrl?: string;
}

export class FootballDataAdapter implements SourceAdapter {
  readonly id = asDataSourceId(FOOTBALL_DATA_SOURCE_ID);
  readonly kind = 'api' as const;
  readonly name = 'football-data.org';

  private readonly apiKey: string;
  private readonly fetchImpl: FootballDataFetch;
  private readonly baseUrl: string;

  constructor(options: FootballDataAdapterOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? FOOTBALL_DATA_BASE_URL;
  }

  async fetch(input: { readonly url: string }): Promise<RawScrape> {
    const response = await this.fetchImpl(input.url, {
      headers: {
        'X-Auth-Token': this.apiKey,
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
      metadata: { provider: 'football-data' },
    };
  }

  /** Full season for one competition; omit `season` for the one in progress. */
  buildCompetitionMatchesUrl(input: {
    readonly code: string;
    readonly season?: number;
  }): string {
    const url = new URL(`${this.baseUrl}/competitions/${input.code}/matches`);
    if (input.season !== undefined) {
      url.searchParams.set('season', String(input.season));
    }
    return url.toString();
  }

  private parseMatchesPayload(scrape: RawScrape): readonly FootballDataMatch[] {
    if (scrape.statusCode === 429) {
      throw new Error('football-data.org rate limit reached (10 req/min)');
    }
    if (scrape.statusCode < 200 || scrape.statusCode >= 300) {
      let detail = `HTTP ${scrape.statusCode}`;
      try {
        const body = JSON.parse(scrape.payload) as FootballDataMatchesResponse;
        if (body.message) detail = `${detail}: ${body.message}`;
      } catch {
        // non-JSON error body; keep the status code only
      }
      throw new Error(`football-data.org request failed (${detail})`);
    }
    const parsed = JSON.parse(scrape.payload) as FootballDataMatchesResponse;
    return parsed.matches ?? [];
  }

  async fetchCompetitionMatches(input: {
    readonly code: string;
    readonly season?: number;
  }): Promise<{
    readonly raw: RawScrape;
    readonly matches: readonly FootballDataMatch[];
  }> {
    const raw = await this.fetch({ url: this.buildCompetitionMatchesUrl(input) });
    return { raw, matches: this.parseMatchesPayload(raw) };
  }

  /**
   * Every tracked competition for the given season (current when omitted),
   * collecting per-competition warnings instead of failing the whole run.
   */
  async fetchTrackedCompetitions(season?: number): Promise<{
    readonly raw: readonly RawScrape[];
    readonly matches: readonly FootballDataMatch[];
    readonly warnings: readonly string[];
  }> {
    const raw: RawScrape[] = [];
    const matches: FootballDataMatch[] = [];
    const warnings: string[] = [];
    for (const competition of TRACKED_COMPETITIONS) {
      const code = competition.footballDataCode;
      try {
        const result = await this.fetchCompetitionMatches(
          season === undefined ? { code } : { code, season },
        );
        raw.push(result.raw);
        matches.push(...result.matches);
      } catch (error) {
        warnings.push(
          `${code}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { raw, matches, warnings };
  }

  async ping(): Promise<{ readonly ok: boolean; readonly results: number }> {
    const scrape = await this.fetch({
      url: this.buildCompetitionMatchesUrl({ code: 'PL' }),
    });
    try {
      return { ok: true, results: this.parseMatchesPayload(scrape).length };
    } catch {
      return { ok: false, results: 0 };
    }
  }
}

export function mapFootballDataStatus(status: string): MatchStatus {
  switch (status.toUpperCase()) {
    case 'FINISHED':
      return 'finished';
    case 'SCHEDULED':
    case 'TIMED':
      return 'scheduled';
    case 'IN_PLAY':
    case 'PAUSED':
      return 'live';
    case 'SUSPENDED':
    case 'POSTPONED':
      return 'postponed';
    case 'CANCELLED':
    case 'AWARDED':
      return 'cancelled';
    default:
      return 'scheduled';
  }
}

export function createFootballDataAdapterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: FootballDataFetch,
): FootballDataAdapter | null {
  const apiKey = env['FOOTBALL_DATA_KEY']?.trim();
  if (!apiKey) return null;
  return new FootballDataAdapter(
    fetchImpl ? { apiKey, fetchImpl } : { apiKey },
  );
}
