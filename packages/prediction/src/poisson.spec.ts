import { describe, expect, it } from 'vitest';
import { argmaxOutcome, buildScoreDistribution, poissonPmf } from './poisson.js';

describe('poissonPmf', () => {
  it('matches closed-form values', () => {
    // Arrange
    const lambda = 1.5;

    // Act
    const p0 = poissonPmf(0, lambda);
    const p2 = poissonPmf(2, lambda);

    // Assert
    expect(p0).toBeCloseTo(Math.exp(-1.5), 10);
    expect(p2).toBeCloseTo((Math.exp(-1.5) * 1.5 ** 2) / 2, 10);
    expect(poissonPmf(-1, lambda)).toBe(0);
  });
});

describe('buildScoreDistribution', () => {
  it('produces a normalized matrix and coherent outcome probabilities', () => {
    // Arrange
    const expectedHome = 1.8;
    const expectedAway = 1.0;

    // Act
    const distribution = buildScoreDistribution(expectedHome, expectedAway);
    const total = distribution.matrix.flat().reduce((sum, value) => sum + value, 0);
    const outcomeTotal =
      distribution.outcome.home + distribution.outcome.draw + distribution.outcome.away;

    // Assert
    expect(total).toBeCloseTo(1, 9);
    expect(outcomeTotal).toBeCloseTo(1, 9);
    expect(distribution.outcome.home).toBeGreaterThan(distribution.outcome.away);
    expect(argmaxOutcome(distribution.outcome)).toBe('home');
  });

  it('returns the most probable score consistent with the matrix', () => {
    // Arrange
    const distribution = buildScoreDistribution(1.1, 1.1);
    const { home, away } = distribution.mostProbableScore;

    // Act
    const probability = distribution.matrix[home]?.[away] ?? 0;
    const maximum = Math.max(...distribution.matrix.flat());

    // Assert
    expect(probability).toBeCloseTo(maximum, 12);
    expect(distribution.mostProbableScore).toEqual({ home: 1, away: 1 });
  });

  it('applies the Dixon-Coles correction to low scores and stays normalized', () => {
    // Arrange
    const independent = buildScoreDistribution(1.3, 1.1);

    // Act
    const corrected = buildScoreDistribution(1.3, 1.1, undefined, -0.1);
    const total = corrected.matrix.flat().reduce((sum, value) => sum + value, 0);

    // Assert
    expect(total).toBeCloseTo(1, 9);
    expect(corrected.matrix[0]?.[0]).toBeGreaterThan(independent.matrix[0]?.[0] ?? 0);
    expect(corrected.matrix[1]?.[1]).toBeGreaterThan(independent.matrix[1]?.[1] ?? 0);
    expect(corrected.matrix[1]?.[0]).toBeLessThan(independent.matrix[1]?.[0] ?? 0);
    expect(corrected.matrix[2]?.[2]).toBeCloseTo(independent.matrix[2]?.[2] ?? 0, 2);
  });

  it('favors the away side when away expected goals dominate', () => {
    // Arrange & Act
    const distribution = buildScoreDistribution(0.6, 2.4);

    // Assert
    expect(argmaxOutcome(distribution.outcome)).toBe('away');
    expect(distribution.outcome.away).toBeGreaterThan(0.6);
  });
});
