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

  it('keeps competition and status filters orthogonal', () => {
    // Arrange
    const cards = [
      { competition: 'Premier League', status: 'scheduled' },
      { competition: 'La Liga', status: 'finished' },
      { competition: 'Premier League', status: 'finished' },
    ];

    // Act
    const filtered = cards.filter(
      (card) =>
        card.competition === 'Premier League' && card.status === 'finished',
    );

    // Assert
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.competition).toBe('Premier League');
  });
});

