export { checksumPayload } from './checksum.js';
export type { RawScrape, SourceAdapter, SourceKind } from './types.js';
export {
  API_FOOTBALL_BASE_URL,
  API_FOOTBALL_FREE_MAX_SEASON,
  API_FOOTBALL_LEAGUES,
  ApiFootballAdapter,
  createApiFootballAdapterFromEnv,
  currentFootballSeason,
  mapApiStatusToMatchStatus,
  mapDateToSeason,
  resolveApiFootballSeason,
  type ApiFootballAdapterOptions,
  type ApiFootballFetch,
  type ApiFootballFixtureItem,
  type ApiFootballFixturesResponse,
} from './apiFootball.js';

export {
  competitionForLeague,
  ingestApiFootballFixtures,
  matchIdFromProvider,
  teamIdFromProvider,
  type IngestFixturesResult,
} from './ingestFixtures.js';
