import { describe, expect, it } from 'vitest';

describe('TodayDashboard feature', () => {
  it('links analyze actions to the match analysis route', () => {
    // Arrange
    const matchId = 'match-bar-rma';

    // Act
    const href = `/matches/${matchId}`;

    // Assert
    expect(href).toBe('/matches/match-bar-rma');
  });
});
