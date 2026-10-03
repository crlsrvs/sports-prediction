import { describe, expect, it } from 'vitest';
import { seasonStart } from './analysis.service.js';

describe('seasonStart', () => {
  it('uses July 1st of the same year from July onwards', () => {
    // Arrange
    const october = new Date('2026-10-02T12:00:00Z');

    // Act
    const start = seasonStart(october);

    // Assert
    expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('falls back to the previous July before July', () => {
    // Arrange
    const march = new Date('2027-03-15T12:00:00Z');

    // Act
    const start = seasonStart(march);

    // Assert
    expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});
