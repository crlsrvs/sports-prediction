export { checksumPayload } from './checksum.js';
export type { RawScrape, SourceAdapter, SourceKind } from './types.js';
export {
  competitionIdForApiFootballLeague,
  competitionIdForFootballDataCode,
  TRACKED_COMPETITIONS,
  type TrackedCompetition,
} from './competitions.js';
export {
  API_FOOTBALL_BASE_URL,
  API_FOOTBALL_FREE_MAX_SEASON,
  API_FOOTBALL_LEAGUES,
  ApiFootballAdapter,
  MVP_LEAGUE_IDS,
  TRACKED_LEAGUE_IDS,
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
  FOOTBALL_DATA_BASE_URL,
  FOOTBALL_DATA_REQUESTS_PER_MINUTE,
  FootballDataAdapter,
  createFootballDataAdapterFromEnv,
  mapFootballDataStatus,
  type FootballDataAdapterOptions,
  type FootballDataFetch,
  type FootballDataMatch,
  type FootballDataMatchesResponse,
  type FootballDataTeam,
} from './footballData.js';

export {
  competitionForLeague,
  ingestApiFootballFixtures,
  ingestFixtures,
  ingestFootballDataMatches,
  matchIdFromProvider,
  normalizeApiFootballFixture,
  normalizeFootballDataMatch,
  providerAlias,
  teamIdFromProvider,
  trackedCompetitions,
  type IngestFixturesResult,
  type NormalizedFixture,
  type NormalizedFixtureTeam,
  type ProviderKey,
  type UnresolvedTeam,
} from './ingestFixtures.js';
