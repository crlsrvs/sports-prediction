import { describe, expect, it } from 'vitest';
import { asCompetitionId, asMatchId } from '@sports-prediction/domain';
import { matchesEvaluationFilter } from './memoryStore.js';
import type { PredictionEvaluationRecord } from './types.js';

function record(
  overrides: Partial<PredictionEvaluationRecord> = {},
): PredictionEvaluationRecord {
  return {
    predictionId: 'pred-1',
    matchId: asMatchId('match-1'),
    modelVersion: 'football-v3',
    competitionId: asCompetitionId('comp-pl'),
    kickoffAt: new Date('2026-09-20T14:00:00Z'),
    generatedAt: new Date('2026-09-18T10:00:00Z'),
    generatedBeforeKickoff: true,
    evaluatedAt: new Date('2026-09-20T17:00:00Z'),
    confidence: 0.55,
    predictedHome: 2,
    predictedAway: 1,
    actualHome: 1,
    actualAway: 1,
    predictedOutcome: 'home',
    actualOutcome: 'draw',
    exactScore: false,
    winnerHit: false,
    brierScore: 0.6,
    logLoss: 1.1,
    outcomeProbabilities: { home: 0.5, draw: 0.3, away: 0.2 },
    ...overrides,
  };
}

describe('matchesEvaluationFilter', () => {
  it('accepts everything when the filter is empty', () => {
    // Arrange
    const item = record();

    // Act
    const accepted = matchesEvaluationFilter(item, {});

    // Assert
    expect(accepted).toBe(true);
  });

  it('filters by model version and kickoff date', () => {
    // Arrange
    const item = record();

    // Act / Assert
    expect(matchesEvaluationFilter(item, { modelVersion: 'football-v2' })).toBe(false);
    expect(matchesEvaluationFilter(item, { since: new Date('2026-09-21') })).toBe(false);
    expect(matchesEvaluationFilter(item, { since: new Date('2026-09-01') })).toBe(true);
  });

  it('drops backfilled predictions when liveOnly is set', () => {
    // Arrange
    const backfilled = record({ generatedBeforeKickoff: false });

    // Act / Assert
    expect(matchesEvaluationFilter(backfilled, { liveOnly: true })).toBe(false);
    expect(matchesEvaluationFilter(backfilled, { liveOnly: false })).toBe(true);
  });
});
