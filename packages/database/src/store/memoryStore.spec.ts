import { describe, expect, it } from 'vitest';
import {
  asCompetitionId,
  asDataSourceId,
  asMatchId,
  asSportId,
  asTeamId,
  type Match,
  type Team,
} from '@sports-prediction/domain';
import { MemoryStore, mergeAliases } from './memoryStore.js';

const sportId = asSportId('sport-football');

function team(id: string, canonicalName: string, aliases: string[] = []): Team {
  return { id: asTeamId(id), sportId, canonicalName, aliases };
}

function match(id: string, home: string, away: string): Match {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: asMatchId(id),
    sportId,
    competitionId: asCompetitionId('comp-pl'),
    seasonId: null,
    homeTeamId: asTeamId(home),
    awayTeamId: asTeamId(away),
    scheduledAt: now,
    venueId: null,
    status: 'finished',
    homeScore: 1,
    awayScore: 0,
    sourceId: asDataSourceId('source-api-football'),
    createdAt: now,
    updatedAt: now,
  };
}

async function storeWithDuplicate(): Promise<MemoryStore> {
  const store = new MemoryStore();
  await store.upsertTeam(team('team-man-city', 'Manchester City', ['Man City']));
  await store.upsertTeam(team('team-af-50', 'Manchester City FC', ['api-football:50']));
  await store.upsertTeam(team('team-liverpool', 'Liverpool'));
  await store.upsertMatch(match('m1', 'team-af-50', 'team-liverpool'));
  await store.upsertMatch(match('m2', 'team-liverpool', 'team-af-50'));
  await store.upsertMatch(match('m3', 'team-liverpool', 'team-man-city'));
  return store;
}

describe('mergeAliases', () => {
  it('combines target aliases with source name and aliases without duplicates', () => {
    // Arrange
    const target = team('a', 'Manchester City', ['Man City']);
    const source = team('b', 'Manchester City FC', ['Man City', 'api-football:50']);

    // Act
    const result = mergeAliases(target, source);

    // Assert
    expect(result).toEqual(['Man City', 'Manchester City FC', 'api-football:50']);
  });
});

describe('MemoryStore.mergeTeams', () => {
  it('re-points matches, combines aliases and deletes the source team', async () => {
    // Arrange
    const store = await storeWithDuplicate();

    // Act
    const result = await store.mergeTeams({
      sourceTeamId: 'team-af-50',
      targetTeamId: 'team-man-city',
    });

    // Assert
    expect(result?.movedMatches).toBe(2);
    expect(result?.mergedTeamId).toBe('team-af-50');
    expect(result?.team.aliases).toContain('api-football:50');
    expect(await store.getTeam('team-af-50')).toBeNull();
    const matches = await store.listMatches();
    expect(matches.find((m) => m.id === 'm1')?.homeTeamId).toBe('team-man-city');
    expect(matches.find((m) => m.id === 'm2')?.awayTeamId).toBe('team-man-city');
    expect(matches.find((m) => m.id === 'm3')?.awayTeamId).toBe('team-man-city');
  });

  it('returns null for same ids or unknown teams', async () => {
    // Arrange
    const store = await storeWithDuplicate();

    // Act
    const same = await store.mergeTeams({
      sourceTeamId: 'team-man-city',
      targetTeamId: 'team-man-city',
    });
    const missing = await store.mergeTeams({
      sourceTeamId: 'nope',
      targetTeamId: 'team-man-city',
    });

    // Assert
    expect(same).toBeNull();
    expect(missing).toBeNull();
    expect(await store.getTeam('team-man-city')).not.toBeNull();
  });
});

describe('MemoryStore.resolveEntity', () => {
  it('merges the provisional team into the chosen one and adds the alias', async () => {
    // Arrange
    const store = await storeWithDuplicate();
    await store.addUnresolvedEntity({
      id: 'unresolved-1',
      incomingName: 'Manchester City FC',
      sourceId: asDataSourceId('source-api-football'),
      createdAt: new Date(),
      provisionalTeamId: asTeamId('team-af-50'),
    });

    // Act
    const result = await store.resolveEntity({
      unresolvedId: 'unresolved-1',
      teamId: 'team-man-city',
      alias: 'Manchester City FC',
    });

    // Assert
    expect(result?.mergedTeamId).toBe('team-af-50');
    expect(result?.movedMatches).toBe(2);
    expect(result?.team.aliases).toEqual(
      expect.arrayContaining(['Man City', 'Manchester City FC', 'api-football:50']),
    );
    expect(await store.listUnresolvedEntities()).toHaveLength(0);
    expect(await store.getTeam('team-af-50')).toBeNull();
  });

  it('only adds the alias when there is no provisional team', async () => {
    // Arrange
    const store = await storeWithDuplicate();
    await store.addUnresolvedEntity({
      id: 'unresolved-2',
      incomingName: 'Man City FC',
      sourceId: asDataSourceId('source-api-football'),
      createdAt: new Date(),
      provisionalTeamId: null,
    });

    // Act
    const result = await store.resolveEntity({
      unresolvedId: 'unresolved-2',
      teamId: 'team-man-city',
      alias: 'Man City FC',
    });

    // Assert
    expect(result?.mergedTeamId).toBeNull();
    expect(result?.movedMatches).toBe(0);
    expect(result?.team.aliases).toContain('Man City FC');
    expect(await store.getTeam('team-af-50')).not.toBeNull();
  });
});
