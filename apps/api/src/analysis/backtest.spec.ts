import { describe, expect, it } from 'vitest';
import { evaluatePrediction } from '@sports-prediction/prediction';
import { summarizeBacktest, type BacktestSample } from './backtest.js';

function sample(
  predicted: { home: number; away: number },
  actual: { home: number; away: number },
  probabilities: { home: number; draw: number; away: number },
  competitionId = 'comp-a',
): BacktestSample {
  const evaluation = evaluatePrediction(predicted, actual.home, actual.away, probabilities);
  const confidence = Math.round(
    Math.max(probabilities.home, probabilities.draw, probabilities.away) * 100,
  );
  return {
    competitionId,
    competitionName: competitionId.toUpperCase(),
    confidence,
    evaluation,
    actualOutcome: evaluation.actualOutcome,
  };
}

describe('summarizeBacktest', () => {
  it('aggregates rates, probabilistic metrics, baselines and per-competition splits', () => {
    // Arrange
    const samples: BacktestSample[] = [
      sample({ home: 2, away: 1 }, { home: 2, away: 1 }, { home: 0.6, draw: 0.25, away: 0.15 }),
      sample({ home: 1, away: 0 }, { home: 0, away: 2 }, { home: 0.5, draw: 0.3, away: 0.2 }),
      sample({ home: 0, away: 1 }, { home: 0, away: 1 }, { home: 0.2, draw: 0.3, away: 0.5 }, 'comp-b'),
      sample({ home: 1, away: 1 }, { home: 0, away: 0 }, { home: 0.3, draw: 0.4, away: 0.3 }, 'comp-b'),
    ];

    // Act
    const summary = summarizeBacktest(samples);

    // Assert
    expect(summary.samples).toBe(4);
    expect(summary.exactScoreRate).toBeCloseTo(0.5, 10);
    expect(summary.winnerRate).toBeCloseTo(0.75, 10);
    expect(summary.brierScore).not.toBeNull();
    expect(summary.logLoss).not.toBeNull();
    expect(summary.byCompetition).toHaveLength(2);
    expect(summary.baselines.map((item) => item.label)).toEqual([
      'always_home',
      'uniform',
      'base_rates',
    ]);
    const uniform = summary.baselines.find((item) => item.label === 'uniform');
    expect(uniform?.brierScore).toBeCloseTo(2 / 3, 10);
    expect(summary.calibration.reduce((total, bucket) => total + bucket.samples, 0)).toBe(4);
  });

  it('returns zeroed metrics when there are no samples', () => {
    // Arrange & Act
    const summary = summarizeBacktest([]);

    // Assert
    expect(summary.samples).toBe(0);
    expect(summary.brierScore).toBeNull();
    expect(summary.baselines).toEqual([]);
    expect(summary.calibration).toEqual([]);
  });
});
