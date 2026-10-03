import {
  asCompetitionId,
  asDataSourceId,
  asMatchId,
  asSportId,
  asTeamId,
  type Competition,
  type Match,
  type Team,
} from '@sports-prediction/domain';
import { matchTeamByAlias } from '@sports-prediction/normalization';
import { API_FOOTBALL_SOURCE_ID } from '@sports-prediction/shared';
import {
  API_FOOTBALL_COMPETITIONS,
  mapApiStatusToMatchStatus,
  type ApiFootballFixtureItem,
} from './apiFootball.js';

const SPORT_ID = asSportId('sport-football');
const SOURCE_ID = asDataSourceId(API_FOOTBALL_SOURCE_ID);

const LEAGUE_TO_COMPETITION: Record<number, string> = Object.fromEntries(
  API_FOOTBALL_COMPETITIONS.map((item) => [item.leagueId, item.competitionId]),
);

/**
 * Domain competitions for every tracked league. Support leagues are created
 * inactive so they feed the models without appearing in the public product.
 */
export function trackedCompetitions(): Competition[] {
  return API_FOOTBALL_COMPETITIONS.map((item) => ({
    id: asCompetitionId(item.competitionId),
    sportId: SPORT_ID,
    name: item.name,
    country: item.country,
    active: item.role === 'featured',
  }));
}

export interface IngestFixturesResult {
  readonly teamsToUpsert: Team[];
  readonly matches: Match[];
  readonly unresolvedNames: string[];
  readonly processed: number;
  readonly failed: number;
}

export function competitionForLeague(
  leagueId: number,
  competitions: readonly Competition[],
): Competition | null {
  const preferredId = LEAGUE_TO_COMPETITION[leagueId];
  if (!preferredId) return null;
  return competitions.find((item) => item.id === preferredId) ?? null;
}

export function teamIdFromProvider(
  providerTeamId: number,
): ReturnType<typeof asTeamId> {
  return asTeamId(`team-af-${providerTeamId}`);
}

export function matchIdFromProvider(
  fixtureId: number,
): ReturnType<typeof asMatchId> {
  return asMatchId(`match-af-${fixtureId}`);
}

/**
 * Maps API-Football fixtures into domain teams/matches using alias matching
 * when possible, otherwise creating provider-scoped team ids.
 */
export function ingestApiFootballFixtures(input: {
  readonly fixtures: readonly ApiFootballFixtureItem[];
  readonly teams: readonly Team[];
  readonly competitions: readonly Competition[];
  readonly now?: Date;
}): IngestFixturesResult {
  const now = input.now ?? new Date();
  const teamsById = new Map(input.teams.map((team) => [String(team.id), team]));
  const dirtyTeamIds = new Set<string>();
  const matches: Match[] = [];
  const unresolvedNames: string[] = [];
  let failed = 0;

  const resolveTeam = (provider: {
    readonly id: number;
    readonly name: string;
  }): Team | null => {
    const existingByAlias = matchTeamByAlias(provider.name, [
      ...teamsById.values(),
    ]);
    if (existingByAlias) {
      const aliases = existingByAlias.team.aliases.includes(provider.name)
        ? existingByAlias.team.aliases
        : [...existingByAlias.team.aliases, provider.name];
      const withAlias: Team = {
        ...existingByAlias.team,
        aliases,
      };
      teamsById.set(String(withAlias.id), withAlias);
      if (aliases !== existingByAlias.team.aliases) {
        dirtyTeamIds.add(String(withAlias.id));
      }
      return withAlias;
    }

    const id = teamIdFromProvider(provider.id);
    const existing = teamsById.get(String(id));
    if (existing) return existing;

    const created: Team = {
      id,
      sportId: SPORT_ID,
      canonicalName: provider.name,
      aliases: [provider.name, `api-football:${provider.id}`],
    };
    teamsById.set(String(created.id), created);
    dirtyTeamIds.add(String(created.id));
    unresolvedNames.push(provider.name);
    return created;
  };

  for (const fixture of input.fixtures) {
    try {
      const competition = competitionForLeague(
        fixture.league.id,
        input.competitions,
      );
      if (!competition) {
        failed += 1;
        continue;
      }

      const homeTeam = resolveTeam(fixture.teams.home);
      const awayTeam = resolveTeam(fixture.teams.away);
      if (!homeTeam || !awayTeam) {
        failed += 1;
        continue;
      }

      const status = mapApiStatusToMatchStatus(fixture.fixture.status.short);
      matches.push({
        id: matchIdFromProvider(fixture.fixture.id),
        sportId: SPORT_ID,
        competitionId: asCompetitionId(competition.id),
        seasonId: null,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        scheduledAt: new Date(fixture.fixture.date),
        venueId: null,
        status,
        homeScore: fixture.goals.home,
        awayScore: fixture.goals.away,
        sourceId: SOURCE_ID,
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      failed += 1;
    }
  }

  return {
    teamsToUpsert: [...dirtyTeamIds]
      .map((id) => teamsById.get(id))
      .filter((team): team is Team => team !== undefined),
    matches,
    unresolvedNames: [...new Set(unresolvedNames)],
    processed: matches.length,
    failed,
  };
}
