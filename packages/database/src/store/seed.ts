import {
  asCompetitionId,
  asDataSourceId,
  asMatchId,
  asPredictionId,
  asSportId,
  asTeamId,
  type Competition,
  type Match,
  type Prediction,
  type Sport,
  type Team,
} from '@sports-prediction/domain';
import type { DataSourceRecord, UnresolvedEntity } from './types.js';

const sportId = asSportId('sport-football');
const sourceId = asDataSourceId('source-seed');

function daysFromNow(days: number, hourUtc = 14): Date {
  const date = new Date();
  date.setUTCHours(hourUtc, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function daysAgo(days: number, hourUtc = 14): Date {
  return daysFromNow(-days, hourUtc);
}

export interface SeedData {
  readonly sports: Sport[];
  readonly competitions: Competition[];
  readonly teams: Team[];
  readonly matches: Match[];
  readonly predictions: Prediction[];
  readonly sources: DataSourceRecord[];
  readonly unresolved: UnresolvedEntity[];
}

export function createSeedData(): SeedData {
  const sports: Sport[] = [
    {
      id: sportId,
      name: 'Football',
      slug: 'football',
      active: true,
    },
  ];

  const competitions: Competition[] = [
    {
      id: asCompetitionId('comp-ucl'),
      sportId,
      name: 'UEFA Champions League',
      country: null,
      active: true,
    },
    {
      id: asCompetitionId('comp-pl'),
      sportId,
      name: 'Premier League',
      country: 'England',
      active: true,
    },
    {
      id: asCompetitionId('comp-laliga'),
      sportId,
      name: 'La Liga',
      country: 'Spain',
      active: true,
    },
  ];

  const teams: Team[] = [
    {
      id: asTeamId('team-barcelona'),
      sportId,
      canonicalName: 'Barcelona',
      aliases: ['FC Barcelona', 'Barça'],
    },
    {
      id: asTeamId('team-real-madrid'),
      sportId,
      canonicalName: 'Real Madrid',
      aliases: ['Madrid', 'Real Madrid CF'],
    },
    {
      id: asTeamId('team-arsenal'),
      sportId,
      canonicalName: 'Arsenal',
      aliases: ['Arsenal FC'],
    },
    {
      id: asTeamId('team-bayern'),
      sportId,
      canonicalName: 'Bayern Munich',
      aliases: ['Bayern', 'FC Bayern'],
    },
    {
      id: asTeamId('team-liverpool'),
      sportId,
      canonicalName: 'Liverpool',
      aliases: ['Liverpool FC'],
    },
    {
      id: asTeamId('team-man-city'),
      sportId,
      canonicalName: 'Manchester City',
      aliases: ['Man City', 'Man City FC', 'Manchester City FC'],
    },
    {
      id: asTeamId('team-atletico'),
      sportId,
      canonicalName: 'Atlético Madrid',
      aliases: ['Atletico Madrid', 'Atleti'],
    },
    {
      id: asTeamId('team-sevilla'),
      sportId,
      canonicalName: 'Sevilla',
      aliases: ['Sevilla FC'],
    },
  ];

  const now = new Date();
  const finished = (
    id: string,
    competitionId: string,
    home: string,
    away: string,
    days: number,
    homeScore: number,
    awayScore: number,
  ): Match => ({
    id: asMatchId(id),
    sportId,
    competitionId: asCompetitionId(competitionId),
    seasonId: null,
    homeTeamId: asTeamId(home),
    awayTeamId: asTeamId(away),
    scheduledAt: daysAgo(days),
    venueId: null,
    status: 'finished',
    homeScore,
    awayScore,
    sourceId,
    createdAt: daysAgo(days + 1),
    updatedAt: daysAgo(days),
  });

  const historical: Match[] = [
    finished('hist-bar-1', 'comp-laliga', 'team-barcelona', 'team-sevilla', 28, 3, 1),
    finished('hist-bar-2', 'comp-laliga', 'team-atletico', 'team-barcelona', 21, 1, 2),
    finished('hist-bar-3', 'comp-ucl', 'team-barcelona', 'team-bayern', 14, 2, 2),
    finished('hist-bar-4', 'comp-laliga', 'team-barcelona', 'team-atletico', 10, 2, 0),
    finished('hist-bar-5', 'comp-laliga', 'team-sevilla', 'team-barcelona', 5, 0, 1),
    finished('hist-rma-1', 'comp-laliga', 'team-real-madrid', 'team-sevilla', 27, 2, 1),
    finished('hist-rma-2', 'comp-laliga', 'team-atletico', 'team-real-madrid', 20, 1, 1),
    finished('hist-rma-3', 'comp-ucl', 'team-real-madrid', 'team-liverpool', 13, 3, 1),
    finished('hist-rma-4', 'comp-laliga', 'team-sevilla', 'team-real-madrid', 9, 2, 1),
    finished('hist-rma-5', 'comp-laliga', 'team-real-madrid', 'team-atletico', 4, 2, 0),
    finished('hist-ars-1', 'comp-pl', 'team-arsenal', 'team-liverpool', 26, 2, 0),
    finished('hist-ars-2', 'comp-pl', 'team-man-city', 'team-arsenal', 19, 1, 1),
    finished('hist-ars-3', 'comp-ucl', 'team-arsenal', 'team-bayern', 12, 2, 1),
    finished('hist-ars-4', 'comp-pl', 'team-liverpool', 'team-arsenal', 8, 1, 2),
    finished('hist-ars-5', 'comp-pl', 'team-arsenal', 'team-man-city', 3, 3, 1),
    finished('hist-bay-1', 'comp-ucl', 'team-bayern', 'team-man-city', 25, 1, 0),
    finished('hist-bay-2', 'comp-ucl', 'team-liverpool', 'team-bayern', 18, 2, 2),
    finished('hist-bay-3', 'comp-ucl', 'team-bayern', 'team-arsenal', 11, 1, 2),
    finished('hist-bay-4', 'comp-ucl', 'team-bayern', 'team-barcelona', 7, 2, 1),
    finished('hist-bay-5', 'comp-ucl', 'team-man-city', 'team-bayern', 2, 1, 1),
    finished('hist-liv-1', 'comp-pl', 'team-liverpool', 'team-man-city', 24, 1, 1),
    finished('hist-liv-2', 'comp-pl', 'team-arsenal', 'team-liverpool', 17, 0, 1),
    finished('hist-mci-1', 'comp-pl', 'team-man-city', 'team-liverpool', 16, 2, 1),
    finished('hist-atl-1', 'comp-laliga', 'team-atletico', 'team-sevilla', 15, 2, 0),
    finished('hist-sev-1', 'comp-laliga', 'team-sevilla', 'team-atletico', 6, 1, 2),
  ];

  const todayMatches: Match[] = [
    {
      id: asMatchId('match-bar-rma'),
      sportId,
      competitionId: asCompetitionId('comp-ucl'),
      seasonId: null,
      homeTeamId: asTeamId('team-barcelona'),
      awayTeamId: asTeamId('team-real-madrid'),
      scheduledAt: daysFromNow(0, 14),
      venueId: null,
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      sourceId,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: asMatchId('match-ars-bay'),
      sportId,
      competitionId: asCompetitionId('comp-ucl'),
      seasonId: null,
      homeTeamId: asTeamId('team-arsenal'),
      awayTeamId: asTeamId('team-bayern'),
      scheduledAt: daysFromNow(0, 17),
      venueId: null,
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      sourceId,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: asMatchId('match-liv-mci'),
      sportId,
      competitionId: asCompetitionId('comp-pl'),
      seasonId: null,
      homeTeamId: asTeamId('team-liverpool'),
      awayTeamId: asTeamId('team-man-city'),
      scheduledAt: daysFromNow(0, 12),
      venueId: null,
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      sourceId,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: asMatchId('match-atl-sev'),
      sportId,
      competitionId: asCompetitionId('comp-laliga'),
      seasonId: null,
      homeTeamId: asTeamId('team-atletico'),
      awayTeamId: asTeamId('team-sevilla'),
      scheduledAt: daysFromNow(0, 15),
      venueId: null,
      status: 'finished',
      homeScore: 2,
      awayScore: 0,
      sourceId,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const sources: DataSourceRecord[] = [
    {
      id: sourceId,
      name: 'Seed Demo Source',
      kind: 'api',
      active: true,
      health: 'healthy',
      lastSuccessAt: now,
      lastFailureAt: null,
      consecutiveFailures: 0,
    },
    {
      id: asDataSourceId('source-api-football'),
      name: 'API-Football',
      kind: 'api',
      active: false,
      health: 'disabled',
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
    },
  ];

  const unresolved: UnresolvedEntity[] = [
    {
      id: 'unresolved-1',
      incomingName: 'Man City FC',
      sourceId: asDataSourceId('source-api-football'),
      createdAt: now,
    },
  ];

  // Prefill one evaluated prediction for the finished La Liga match.
  const evaluatedPrediction: Prediction = {
    id: asPredictionId('pred-atl-sev'),
    matchId: asMatchId('match-atl-sev'),
    generatedAt: daysAgo(0, 10),
    dataCutoffAt: daysAgo(0, 9),
    modelVersion: 'football-v1',
    predictedScore: { home: 2, away: 1 },
    expectedGoals: { home: 1.7, away: 0.9 },
    confidence: 71,
    factors: [
      {
        feature: 'home_advantage',
        value: 0.18,
        impact: 0.1,
        direction: 'positive',
        explanation: 'Atlético Madrid tiene ventaja de local',
      },
    ],
    outcomeProbabilities: null,
  };

  return {
    sports,
    competitions,
    teams,
    matches: [...historical, ...todayMatches],
    predictions: [evaluatedPrediction],
    sources,
    unresolved,
  };
}
