import { describe, expect, it } from 'vitest';
import { availabilityAdjustments, teamAvailability } from './availability.js';

const kickoff = new Date('2026-10-09T19:00:00Z');
const cutoff = new Date('2026-10-09T12:00:00Z');

describe('teamAvailability', () => {
  it('ignores absences learned after the cutoff', () => {
    // Arrange
    const late = {
      teamId: 'team-a',
      playerName: 'Ana',
      matchDay: kickoff,
      knownAt: new Date('2026-10-09T18:00:00Z'),
    };

    // Act
    const result = teamAvailability({
      teamId: 'team-a',
      kickoffAt: kickoff,
      dataCutoffAt: cutoff,
      absences: [late],
      lineups: [],
    });

    // Assert
    expect(result.injuryImpact).toBe(0);
    expect(result.absentPlayers).toEqual([]);
  });

  it('caps the expected-goals penalty and measures lineup turnover', () => {
    // Arrange
    const knownAt = new Date('2026-10-08T10:00:00Z');
    const absences = ['Ana', 'Bea', 'Cora', 'Dina', 'Eva', 'Fay'].map((playerName) => ({
      teamId: 'team-a',
      playerName,
      matchDay: kickoff,
      knownAt,
    }));

    // Act
    const result = teamAvailability({
      teamId: 'team-a',
      kickoffAt: kickoff,
      dataCutoffAt: cutoff,
      absences,
      lineups: [
        {
          teamId: 'team-a',
          matchDay: new Date('2026-10-01T19:00:00Z'),
          knownAt,
          playerNames: ['Ana', 'Bea', 'Gala', 'Hana'],
        },
      ],
    });

    // Assert
    expect(result.injuryImpact).toBeCloseTo(-0.3, 10);
    expect(result.squadChange).toBeCloseTo(-0.5, 10);
    expect(result.absentPlayers).toHaveLength(6);
  });

  it('does not apply an absence reported for a different match day', () => {
    // Arrange / Act
    const result = teamAvailability({
      teamId: 'team-a',
      kickoffAt: kickoff,
      dataCutoffAt: cutoff,
      absences: [
        {
          teamId: 'team-a',
          playerName: 'Ana',
          matchDay: new Date('2026-09-01T19:00:00Z'),
          knownAt: new Date('2026-08-30T10:00:00Z'),
        },
      ],
      lineups: [],
    });

    // Assert
    expect(result.injuryImpact).toBe(0);
  });
});

describe('availabilityAdjustments', () => {
  it('assigns each side its own penalty', () => {
    // Arrange
    const knownAt = new Date('2026-10-08T10:00:00Z');

    // Act
    const result = availabilityAdjustments({
      homeTeamId: 'home',
      awayTeamId: 'away',
      kickoffAt: kickoff,
      dataCutoffAt: cutoff,
      absences: [
        { teamId: 'away', playerName: 'Zoe', matchDay: kickoff, knownAt },
      ],
      lineups: [],
    });

    // Assert
    expect(result.injuryImpactHome).toBe(0);
    expect(result.injuryImpactAway).toBeCloseTo(-0.06, 10);
    expect(result.squadChangeAway).toBe(0);
  });
});
