import type { Team } from '@sports-prediction/domain';
import { normalizeEntityText } from './normalizeText.js';

export interface EntityMatchCandidate {
  readonly team: Team;
  readonly confidence: number;
  readonly reason: 'exact_alias' | 'normalized_text';
}

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

  return null;
}
