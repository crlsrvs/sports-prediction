import { describe, expect, it } from 'vitest';
import {
  brierScore,
  evaluatePrediction,
  logLoss,
  rankedProbabilityScore,
} from './evaluatePrediction.js';

describe('evaluatePrediction', () => {
  it('scores exact result and implied winner', () => {
    // Arrange
    const predicted = { home: 2, away: 1 };

    // Act
    const evaluation = evaluatePrediction(predicted, 2, 1);

    // Assert
    expect(evaluation.exactScore).toBe(true);
    expect(evaluation.winnerImpliedMatch).toBe(true);
    expect(evaluation.predictedOutcome).toBe('home');
    expect(evaluation.actualOutcome).toBe('home');
    expect(evaluation.brierScore).toBeNull();
    expect(evaluation.logLoss).toBeNull();
  });

  it('computes probabilistic metrics when probabilities are provided', () => {
    // Arrange
    const probabilities = { home: 0.5, draw: 0.3, away: 0.2 };

    // Act
    const evaluation = evaluatePrediction({ home: 1, away: 0 }, 0, 1, probabilities);

    // Assert
    expect(evaluation.winnerImpliedMatch).toBe(false);
    expect(evaluation.actualOutcome).toBe('away');
    expect(evaluation.brierScore).toBeCloseTo(0.5 ** 2 + 0.3 ** 2 + 0.8 ** 2, 10);
    expect(evaluation.logLoss).toBeCloseTo(-Math.log(0.2), 10);
  });
});

describe('brierScore / logLoss', () => {
  it('rewards confident correct forecasts and punishes confident wrong ones', () => {
    // Arrange
    const confident = { home: 0.9, draw: 0.05, away: 0.05 };

    // Act
    const correct = brierScore(confident, 'home');
    const wrong = brierScore(confident, 'away');

    // Assert
    expect(correct).toBeLessThan(wrong);
    expect(logLoss(confident, 'home')).toBeLessThan(logLoss(confident, 'away'));
  });

  it('uniform forecast has the known Brier value 2/3', () => {
    // Arrange
    const uniform = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };

    // Act
    const score = brierScore(uniform, 'draw');

    // Assert
    expect(score).toBeCloseTo(2 / 3, 10);
  });
});

describe('rankedProbabilityScore', () => {
  it('matches the known values of a uniform 1X2 forecast', () => {
    // Arrange
    const uniform = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };

    // Act
    const home = rankedProbabilityScore(uniform, 'home');
    const draw = rankedProbabilityScore(uniform, 'draw');

    // Assert
    expect(home).toBeCloseTo(5 / 18, 10);
    expect(rankedProbabilityScore(uniform, 'away')).toBeCloseTo(5 / 18, 10);
    expect(draw).toBeCloseTo(1 / 9, 10);
  });

  it('is zero for a forecast that puts all mass on the actual outcome', () => {
    // Arrange
    const certain = { home: 1, draw: 0, away: 0 };

    // Act
    const score = rankedProbabilityScore(certain, 'home');

    // Assert
    expect(score).toBeCloseTo(0, 10);
  });
});
