import type { Match } from '@sports-prediction/domain';
import { isLiveSourceId, SEED_SOURCE_ID } from '@sports-prediction/shared';
import type { FinishedMatchResult } from './buildFeatureSnapshot.js';

/**
 * Finished results usable as model history, sorted by kickoff.
 * Demo (seed) results are fabricated; once any real provider data exists they
 * are dropped so they cannot contaminate ratings or backtests.
 */
export function buildFinishedHistory(
  matches: readonly Match[],
): FinishedMatchResult[] {
  const hasLiveData = matches.some((match) =>
    isLiveSourceId(String(match.sourceId)),
  );
  return matches
    .filter(
      (match) =>
        match.status === 'finished' &&
        match.homeScore !== null &&
        match.awayScore !== null &&
        !(hasLiveData && String(match.sourceId) === SEED_SOURCE_ID),
    )
    .map((match) => ({
      match,
      homeScore: match.homeScore as number,
      awayScore: match.awayScore as number,
    }))
    .sort(
      (a, b) => a.match.scheduledAt.getTime() - b.match.scheduledAt.getTime(),
    );
}
