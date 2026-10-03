import {
  asCompetitionId,
  asDataSourceId,
  asMatchId,
  asSportId,
  asTeamId,
  type Competition,
  type Match,
  type MatchId,
  type MatchStatus,
  type Team,
  type TeamId,
} from '@sports-prediction/domain';
import { matchTeamByAlias } from '@sports-prediction/normalization';
import {
  API_FOOTBALL_SOURCE_ID,
  FOOTBALL_DATA_SOURCE_ID,
} from '@sports-prediction/shared';
import {
  mapApiStatusToMatchStatus,
  type ApiFootballFixtureItem,
} from './apiFootball.js';
import {
  competitionIdForApiFootballLeague,
  competitionIdForFootballDataCode,
  TRACKED_COMPETITIONS,
} from './competitions.js';
import { mapFootballDataStatus, type FootballDataMatch } from './footballData.js';

const SPORT_ID = asSportId('sport-football');

/**
 * Domain competitions for every tracked league. Support leagues are created
 * inactive so they feed the models without appearing in the public product.
 */
export function trackedCompetitions(): Competition[] {
  return TRACKED_COMPETITIONS.map((item) => ({
    id: asCompetitionId(item.competitionId),
    sportId: SPORT_ID,
    name: item.name,
    country: item.country,
    active: item.role === 'featured',
  }));
}

export type ProviderKey = 'api-football' | 'football-data';

interface ProviderConfig {
  readonly sourceId: string;
  readonly teamIdPrefix: string;
  readonly matchIdPrefix: string;
}

const PROVIDERS: Record<ProviderKey, ProviderConfig> = {
  'api-football': {
    sourceId: API_FOOTBALL_SOURCE_ID,
    teamIdPrefix: 'team-af-',
    matchIdPrefix: 'match-af-',
  },
  'football-data': {
    sourceId: FOOTBALL_DATA_SOURCE_ID,
    teamIdPrefix: 'team-fd-',
    matchIdPrefix: 'match-fd-',
  },
};

/** Provider-neutral fixture shape every adapter is mapped into before ingest. */
export interface NormalizedFixture {
  readonly provider: ProviderKey;
  readonly providerMatchId: number;
  readonly competitionId: string | null;
  readonly kickoffAt: Date;
  readonly status: MatchStatus;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly home: NormalizedFixtureTeam;
  readonly away: NormalizedFixtureTeam;
}

export interface NormalizedFixtureTeam {
  readonly providerTeamId: number;
  /** Candidate names in preference order (full name first). */
  readonly names: readonly string[];
}

export interface UnresolvedTeam {
  readonly name: string;
  /** Provider-scoped team created for this name; merge target for admins. */
  readonly teamId: TeamId;
}

export interface IngestFixturesResult {
  readonly teamsToUpsert: Team[];
  readonly matches: Match[];
  readonly unresolvedTeams: UnresolvedTeam[];
  readonly processed: number;
  readonly failed: number;
  /** Fixtures that updated a match previously imported from another provider. */
  readonly deduplicated: number;
}

export function providerAlias(provider: ProviderKey, providerTeamId: number): string {
  return `${provider}:${providerTeamId}`;
}

export function teamIdFromProvider(
  providerTeamId: number,
  provider: ProviderKey = 'api-football',
): TeamId {
  return asTeamId(`${PROVIDERS[provider].teamIdPrefix}${providerTeamId}`);
}

export function matchIdFromProvider(
  fixtureId: number,
  provider: ProviderKey = 'api-football',
): MatchId {
  return asMatchId(`${PROVIDERS[provider].matchIdPrefix}${fixtureId}`);
}

export function competitionForLeague(
  leagueId: number,
  competitions: readonly Competition[],
): Competition | null {
  const preferredId = competitionIdForApiFootballLeague(leagueId);
  if (!preferredId) return null;
  return competitions.find((item) => item.id === preferredId) ?? null;
}

/** Same competition, same two teams, same UTC day: the same real match. */
function matchIdentityKey(input: {
  readonly competitionId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly kickoffAt: Date;
}): string {
  const day = input.kickoffAt.toISOString().slice(0, 10);
  return `${input.competitionId}|${input.homeTeamId}|${input.awayTeamId}|${day}`;
}

/**
 * Maps normalized fixtures into domain teams/matches. Teams resolve by provider
 * id alias first, then by name/alias matching, otherwise a provider-scoped team
 * is created and reported as unresolved. Matches already known from another
 * provider (same competition, teams and day) are updated instead of duplicated.
 */
export function ingestFixtures(input: {
  readonly fixtures: readonly NormalizedFixture[];
  readonly teams: readonly Team[];
  readonly competitions: readonly Competition[];
  readonly existingMatches?: readonly Match[];
  readonly now?: Date;
}): IngestFixturesResult {
  const now = input.now ?? new Date();
  const teamsById = new Map(input.teams.map((team) => [String(team.id), team]));
  const competitionIds = new Set(input.competitions.map((item) => String(item.id)));
  const existingByIdentity = new Map<string, Match>();
  const keyForMatch = (match: Match): string =>
    matchIdentityKey({
      competitionId: String(match.competitionId),
      homeTeamId: String(match.homeTeamId),
      awayTeamId: String(match.awayTeamId),
      kickoffAt: match.scheduledAt,
    });
  for (const match of input.existingMatches ?? []) {
    existingByIdentity.set(keyForMatch(match), match);
  }

  const dirtyTeamIds = new Set<string>();
  const matches: Match[] = [];
  const unresolvedTeams = new Map<string, UnresolvedTeam>();
  let failed = 0;
  let deduplicated = 0;

  const resolveTeam = (
    provider: ProviderKey,
    team: NormalizedFixtureTeam,
  ): Team | null => {
    const primaryName = team.names[0];
    if (!primaryName) return null;

    const alias = providerAlias(provider, team.providerTeamId);
    const byProviderId = [...teamsById.values()].find((candidate) =>
      candidate.aliases.includes(alias),
    );
    if (byProviderId) return byProviderId;

    for (const name of team.names) {
      const byName = matchTeamByAlias(name, [...teamsById.values()]);
      if (!byName) continue;
      const aliases = new Set(byName.team.aliases);
      const before = aliases.size;
      aliases.add(primaryName);
      aliases.add(alias);
      const withAlias: Team = { ...byName.team, aliases: [...aliases] };
      teamsById.set(String(withAlias.id), withAlias);
      if (aliases.size !== before) dirtyTeamIds.add(String(withAlias.id));
      return withAlias;
    }

    const id = teamIdFromProvider(team.providerTeamId, provider);
    const existing = teamsById.get(String(id));
    if (existing) return existing;

    const created: Team = {
      id,
      sportId: SPORT_ID,
      canonicalName: primaryName,
      aliases: [...new Set([...team.names, alias])],
    };
    teamsById.set(String(created.id), created);
    dirtyTeamIds.add(String(created.id));
    unresolvedTeams.set(primaryName, { name: primaryName, teamId: id });
    return created;
  };

  for (const fixture of input.fixtures) {
    try {
      if (!fixture.competitionId || !competitionIds.has(fixture.competitionId)) {
        failed += 1;
        continue;
      }
      const homeTeam = resolveTeam(fixture.provider, fixture.home);
      const awayTeam = resolveTeam(fixture.provider, fixture.away);
      if (!homeTeam || !awayTeam) {
        failed += 1;
        continue;
      }

      const identity = matchIdentityKey({
        competitionId: fixture.competitionId,
        homeTeamId: String(homeTeam.id),
        awayTeamId: String(awayTeam.id),
        kickoffAt: fixture.kickoffAt,
      });
      const known = existingByIdentity.get(identity);
      const ownId = matchIdFromProvider(fixture.providerMatchId, fixture.provider);
      if (known && String(known.id) !== String(ownId)) deduplicated += 1;

      const match: Match = {
        id: known?.id ?? ownId,
        sportId: SPORT_ID,
        competitionId: asCompetitionId(fixture.competitionId),
        seasonId: known?.seasonId ?? null,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        scheduledAt: fixture.kickoffAt,
        venueId: known?.venueId ?? null,
        status: fixture.status,
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        sourceId: known?.sourceId ?? asDataSourceId(PROVIDERS[fixture.provider].sourceId),
        createdAt: known?.createdAt ?? now,
        updatedAt: now,
      };
      matches.push(match);
      existingByIdentity.set(identity, match);
    } catch {
      failed += 1;
    }
  }

  return {
    teamsToUpsert: [...dirtyTeamIds]
      .map((id) => teamsById.get(id))
      .filter((team): team is Team => team !== undefined),
    matches,
    unresolvedTeams: [...unresolvedTeams.values()],
    processed: matches.length,
    failed,
    deduplicated,
  };
}

export function normalizeApiFootballFixture(
  fixture: ApiFootballFixtureItem,
): NormalizedFixture {
  return {
    provider: 'api-football',
    providerMatchId: fixture.fixture.id,
    competitionId: competitionIdForApiFootballLeague(fixture.league.id),
    kickoffAt: new Date(fixture.fixture.date),
    status: mapApiStatusToMatchStatus(fixture.fixture.status.short),
    homeScore: fixture.goals.home,
    awayScore: fixture.goals.away,
    home: { providerTeamId: fixture.teams.home.id, names: [fixture.teams.home.name] },
    away: { providerTeamId: fixture.teams.away.id, names: [fixture.teams.away.name] },
  };
}

export function normalizeFootballDataMatch(match: FootballDataMatch): NormalizedFixture {
  const names = (team: FootballDataMatch['homeTeam']): string[] =>
    [team.name, team.shortName].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
  const status = mapFootballDataStatus(match.status);
  const scored = status === 'finished' || status === 'live';
  return {
    provider: 'football-data',
    providerMatchId: match.id,
    competitionId: competitionIdForFootballDataCode(match.competition.code),
    kickoffAt: new Date(match.utcDate),
    status,
    homeScore: scored ? match.score.fullTime.home : null,
    awayScore: scored ? match.score.fullTime.away : null,
    home: { providerTeamId: match.homeTeam.id, names: names(match.homeTeam) },
    away: { providerTeamId: match.awayTeam.id, names: names(match.awayTeam) },
  };
}

/** API-Football entry point kept for the existing worker jobs. */
export function ingestApiFootballFixtures(input: {
  readonly fixtures: readonly ApiFootballFixtureItem[];
  readonly teams: readonly Team[];
  readonly competitions: readonly Competition[];
  readonly existingMatches?: readonly Match[];
  readonly now?: Date;
}): IngestFixturesResult {
  return ingestFixtures({
    ...input,
    fixtures: input.fixtures.map(normalizeApiFootballFixture),
  });
}

export function ingestFootballDataMatches(input: {
  readonly matches: readonly FootballDataMatch[];
  readonly teams: readonly Team[];
  readonly competitions: readonly Competition[];
  readonly existingMatches?: readonly Match[];
  readonly now?: Date;
}): IngestFixturesResult {
  const { matches, ...rest } = input;
  return ingestFixtures({
    ...rest,
    fixtures: matches.map(normalizeFootballDataMatch),
  });
}
