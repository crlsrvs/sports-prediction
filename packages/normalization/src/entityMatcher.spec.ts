import { describe, expect, it } from 'vitest';
import { asSportId, asTeamId, type Team } from '@sports-prediction/domain';
import { matchTeamByAlias } from './entityMatcher.js';

describe('matchTeamByAlias', () => {
  it('resolves known aliases to the canonical team', () => {
    // Arrange
    const teams: Team[] = [
      {
        id: asTeamId('mci'),
        sportId: asSportId('football'),
        canonicalName: 'Manchester City',
        aliases: ['Man City', 'Man City FC', 'Manchester City FC'],
      },
    ];

    // Act
    const match = matchTeamByAlias('Man City FC', teams);

    // Assert
    expect(match?.team.canonicalName).toBe('Manchester City');
    expect(match?.reason).toBe('exact_alias');
  });

  it('matches club names that differ only by legal form or founding year', () => {
    // Arrange
    const teams: Team[] = [
      team('b04', 'Bayer Leverkusen'),
      team('mun', 'Manchester United'),
      team('psg', 'Paris Saint Germain'),
    ];

    // Act & Assert
    expect(matchTeamByAlias('Bayer 04 Leverkusen', teams)?.team.id).toBe('b04');
    expect(matchTeamByAlias('Manchester United FC', teams)?.team.id).toBe('mun');
    expect(matchTeamByAlias('Paris Saint-Germain FC', teams)?.reason).toBe('club_name');
  });

  it('does not guess between distinct clubs or ambiguous candidates', () => {
    // Arrange
    const teams: Team[] = [
      team('mun', 'Manchester United'),
      team('mci', 'Manchester City'),
      team('ath', 'Athletic Club', ['Athletic']),
      team('ath2', 'Athletic Bilbao', ['Athletic']),
    ];

    // Act & Assert
    expect(matchTeamByAlias('Manchester FC', teams)).toBeNull();
    expect(matchTeamByAlias('Leeds United FC', teams)).toBeNull();
    expect(matchTeamByAlias('Athletic FC', teams)).toBeNull();
  });
});

function team(id: string, canonicalName: string, aliases: string[] = []): Team {
  return { id: asTeamId(id), sportId: asSportId('football'), canonicalName, aliases };
}
