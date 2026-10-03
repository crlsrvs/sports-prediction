import type { Team } from '@sports-prediction/domain';
import { normalizeClubName, normalizeEntityText } from './normalizeText.js';

export interface EntityMatchCandidate {
  readonly team: Team;
  readonly confidence: number;
  readonly reason: 'exact_alias' | 'normalized_text' | 'club_name';
}

/**
 * Deliberately conservative matcher: exact alias, then accent/case-insensitive
 * text, then club name without legal forms or years. The last pass only
 * matches when exactly one team qualifies; ambiguity yields null so an admin
 * decides instead of the code guessing.
 */
export function matchTeamByAlias(
  incomingName: string,
  teams: readonly Team[],
): EntityMatchCandidate | null {
  const normalizedIncoming = normalizeEntityText(incomingName);

  for (const team of teams) {
    const aliasPool = [team.canonicalName, ...team.aliases];
    for (const alias of aliasPool) {
      if (alias === incomingName) {
        return { team, confidence: 1, reason: 'exact_alias' };
      }
      if (normalizeEntityText(alias) === normalizedIncoming) {
        return { team, confidence: 0.9, reason: 'normalized_text' };
      }
    }
  }

  const clubIncoming = normalizeClubName(incomingName);
  if (!clubIncoming) return null;
  const candidates = teams.filter((team) =>
    [team.canonicalName, ...team.aliases].some(
      (alias) => normalizeClubName(alias) === clubIncoming,
    ),
  );
  const [only] = candidates;
  if (candidates.length === 1 && only) {
    return { team: only, confidence: 0.8, reason: 'club_name' };
  }
  return null;
}
