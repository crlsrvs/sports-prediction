import { describe, expect, it } from 'vitest';
import type { Match, TeamId } from '@sports-prediction/domain';
import {
  asCompetitionId,
  asMatchId,
  asSportId,
  asTeamId,
} from '@sports-prediction/domain';
import type { FinishedMatchResult } from './buildFeatureSnapshot.js';
import { fitDixonColes } from './dixonColes.js';

const DAY = 24 * 60 * 60 * 1000;
const START = new Date('2025-01-01T12:00:00.000Z').getTime();

function result(
  index: number,
  home: TeamId,
  away: TeamId,
  homeScore: number,
  awayScore: number,
): FinishedMatchResult {
  const at = new Date(START + index * DAY);
  const match: Match = {
    id: asMatchId(`m-${index}`),
    sportId: asSportId('football'),
    competitionId: asCompetitionId('league'),
    seasonId: null,
    homeTeamId: home,
    awayTeamId: away,
    scheduledAt: at,
    venueId: null,
    status: 'finished',
    homeScore,
    awayScore,
    sourceId: null,
    createdAt: at,
    updatedAt: at,
  };
  return { match, homeScore, awayScore };
}

const STRONG = asTeamId('strong');
const WEAK = asTeamId('weak');
const MID = asTeamId('mid');

function buildHistory(): FinishedMatchResult[] {
  const history: FinishedMatchResult[] = [];
  let index = 0;
  for (let round = 0; round < 6; round += 1) {
    history.push(result(index++, STRONG, WEAK, 3, 0));
    history.push(result(index++, WEAK, STRONG, 0, 2));
    history.push(result(index++, STRONG, MID, 2, 1));
    history.push(result(index++, MID, STRONG, 1, 1));
    history.push(result(index++, MID, WEAK, 2, 0));
    history.push(result(index++, WEAK, MID, 1, 2));
  }
  return history;
}

describe('fitDixonColes', () => {
  it('ranks attack and defense consistently with results', () => {
    // Arrange
    const history = buildHistory();
    const cutoffAt = new Date(START + 400 * DAY);

    // Act
    const fit = fitDixonColes({ history, cutoffAt });
    const strong = fit.ratingFor(STRONG);
    const weak = fit.ratingFor(WEAK);

    // Assert
    expect(fit.matches).toBe(history.length);
    expect(strong.attack).toBeGreaterThan(weak.attack);
    expect(strong.defense).toBeLessThan(weak.defense);
    expect(fit.homeAdvantage).toBeGreaterThan(0.5);
    expect(fit.rho).toBeGreaterThanOrEqual(-0.25);
    expect(fit.rho).toBeLessThanOrEqual(0.2);
  });

  it('uses only results strictly before the cutoff', () => {
    // Arrange
    const history = buildHistory();
    const firstMatchAt = history[0]?.match.scheduledAt ?? new Date(START);

    // Act
    const fit = fitDixonColes({ history, cutoffAt: firstMatchAt });

    // Assert
    expect(fit.matches).toBe(0);
    expect(fit.ratingFor(STRONG)).toEqual({
      attack: 1,
      defense: fit.leagueAverageGoals,
      matches: 0,
    });
  });

  it('keeps unknown teams at league average and reports zero support', () => {
    // Arrange
    const history = buildHistory();
    const cutoffAt = new Date(START + 400 * DAY);

    // Act
    const fit = fitDixonColes({ history, cutoffAt });
    const ratings = fit.matchRatings(asTeamId('newcomer'), STRONG);

    // Assert
    expect(ratings.model).toBe('dixon-coles');
    expect(ratings.homeAttack).toBe(1);
    expect(ratings.homeMatches).toBe(0);
    expect(ratings.awayMatches).toBeGreaterThan(0);
  });

  it('shrinks ratings harder toward the average with a larger prior', () => {
    // Arrange
    const history = buildHistory();
    const cutoffAt = new Date(START + 400 * DAY);

    // Act
    const loose = fitDixonColes({ history, cutoffAt, options: { priorWeight: 1 } });
    const tight = fitDixonColes({ history, cutoffAt, options: { priorWeight: 50 } });

    // Assert
    expect(Math.abs(tight.ratingFor(STRONG).attack - 1)).toBeLessThan(
      Math.abs(loose.ratingFor(STRONG).attack - 1),
    );
  });
});
