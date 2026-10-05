import type { Team, TeamId } from '@sports-prediction/domain';
import { providerAlias, teamIdFromProvider, type ProviderKey } from './ingestFixtures.js';
import type { FootballDataMatch } from './footballData.js';

export interface ParsedInjury {
  readonly providerTeamId: number;
  readonly playerName: string;
  readonly reason: string;
  readonly matchDay: Date;
}

export interface ResolvedAbsence {
  readonly teamId: TeamId;
  readonly playerName: string;
  readonly reason: string;
  readonly matchDay: Date;
}

export interface ResolvedLineup {
  readonly teamId: TeamId;
  readonly matchDay: Date;
  readonly playerNames: readonly string[];
}

interface AliasRef {
  readonly alias: string;
  readonly teamId: TeamId;
}

/** Parses an API-Football `/injuries` body. API errors become `error`, not throws. */
export function parseApiFootballInjuries(payload: string): {
  readonly injuries: readonly ParsedInjury[];
  readonly error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return { injuries: [], error: 'respuesta de lesiones no es JSON' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { injuries: [], error: 'respuesta de lesiones vacía' };
  }
  const body = parsed as {
    readonly errors?: unknown;
    readonly response?: unknown;
  };
  const error = injuryError(body.errors);
  if (error) return { injuries: [], error };
  if (!Array.isArray(body.response)) return { injuries: [], error: null };

  const injuries: ParsedInjury[] = [];
  for (const item of body.response) {
    if (!item || typeof item !== 'object') continue;
    const row = item as {
      readonly player?: { readonly name?: unknown; readonly reason?: unknown };
      readonly team?: { readonly id?: unknown };
      readonly fixture?: { readonly date?: unknown };
    };
    const name = typeof row.player?.name === 'string' ? row.player.name.trim() : '';
    const teamId = Number(row.team?.id);
    const matchDay = new Date(String(row.fixture?.date ?? ''));
    if (!name || !Number.isInteger(teamId) || Number.isNaN(matchDay.getTime())) continue;
    const reason =
      typeof row.player?.reason === 'string' && row.player.reason.trim()
        ? row.player.reason.trim()
        : 'unknown';
    injuries.push({ providerTeamId: teamId, playerName: name, reason, matchDay });
  }
  return { injuries, error: null };
}

export function lineupsFromFootballDataMatches(
  matches: readonly FootballDataMatch[],
  teams: readonly Team[],
  aliases: readonly AliasRef[],
): ResolvedLineup[] {
  const records: ResolvedLineup[] = [];
  for (const match of matches) {
    const matchDay = new Date(match.utcDate);
    if (Number.isNaN(matchDay.getTime())) continue;
    for (const side of [match.homeTeam, match.awayTeam]) {
      const names = playerNames(side.lineup);
      if (names.length === 0) continue;
      const teamId = resolveProviderTeam(side.id, 'football-data', teams, aliases);
      if (!teamId) continue;
      records.push({ teamId, matchDay, playerNames: names });
    }
  }
  return records;
}

export function injuriesToAbsences(input: {
  readonly injuries: readonly ParsedInjury[];
  readonly teams: readonly Team[];
  readonly aliases: readonly AliasRef[];
}): ResolvedAbsence[] {
  const records: ResolvedAbsence[] = [];
  for (const injury of input.injuries) {
    const teamId = resolveProviderTeam(
      injury.providerTeamId,
      'api-football',
      input.teams,
      input.aliases,
    );
    if (!teamId) continue;
    records.push({
      teamId,
      playerName: injury.playerName,
      reason: injury.reason,
      matchDay: injury.matchDay,
    });
  }
  return records;
}

export function resolveProviderTeam(
  providerTeamId: number,
  provider: ProviderKey,
  teams: readonly Team[],
  aliases: readonly AliasRef[],
): TeamId | null {
  const aliasKey = providerAlias(provider, providerTeamId);
  const alias = aliases.find((item) => item.alias === aliasKey);
  if (alias) return alias.teamId;
  const direct = teamIdFromProvider(providerTeamId, provider);
  return teams.some((team) => team.id === direct) ? direct : null;
}

export function absenceId(
  sourceId: string,
  teamId: string,
  playerName: string,
  matchDay: Date,
): string {
  const slug = playerName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `absence-${sourceId}-${teamId}-${slug || 'player'}-${matchDay.toISOString().slice(0, 10)}`;
}

export function lineupId(sourceId: string, teamId: string, matchDay: Date): string {
  return `lineup-${sourceId}-${teamId}-${matchDay.toISOString().slice(0, 10)}`;
}

function playerNames(lineup: FootballDataMatch['homeTeam']['lineup']): readonly string[] {
  if (!lineup) return [];
  const names: string[] = [];
  for (const player of lineup) {
    const name = player.name?.trim();
    if (name) names.push(name);
  }
  return names;
}

function injuryError(errors: unknown): string | null {
  if (!errors || typeof errors !== 'object') return null;
  if (Array.isArray(errors)) return errors.length > 0 ? JSON.stringify(errors) : null;
  const entries = Object.entries(errors as Record<string, unknown>);
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join('; ');
}
