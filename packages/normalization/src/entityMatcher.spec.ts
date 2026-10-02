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
});
