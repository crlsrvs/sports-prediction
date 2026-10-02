import type {
  Competition,
  DataSourceId,
  Match,
  MatchId,
  Prediction,
  Sport,
  Team,
} from '@sports-prediction/domain';

export type SourceHealth = 'healthy' | 'warning' | 'broken' | 'disabled';

export interface DataSourceRecord {
  readonly id: DataSourceId;
  readonly name: string;
  readonly kind: 'api' | 'web';
  readonly active: boolean;
  readonly health: SourceHealth;
  readonly lastSuccessAt: Date | null;
  readonly lastFailureAt: Date | null;
  readonly consecutiveFailures: number;
}

export interface ScrapingJobRecord {
  readonly id: string;
  readonly sourceId: DataSourceId;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly status: 'queued' | 'running' | 'success' | 'partial' | 'failed';
  readonly recordsFound: number;
  readonly recordsProcessed: number;
  readonly recordsFailed: number;
  readonly error: string | null;
}

export interface UnresolvedEntity {
  readonly id: string;
  readonly incomingName: string;
  readonly sourceId: DataSourceId;
  readonly createdAt: Date;
}

export interface AppStore {
  listSports(): Promise<readonly Sport[]>;
  upsertSport(sport: Sport): Promise<Sport>;
  listCompetitions(sportId?: string): Promise<readonly Competition[]>;
  upsertCompetition(competition: Competition): Promise<Competition>;
  listTeams(): Promise<readonly Team[]>;
  getTeam(id: string): Promise<Team | null>;
  upsertTeam(team: Team): Promise<Team>;
  listMatches(): Promise<readonly Match[]>;
  getMatch(id: MatchId | string): Promise<Match | null>;
  upsertMatch(match: Match): Promise<Match>;
  listPredictions(): Promise<readonly Prediction[]>;
  getLatestPrediction(matchId: MatchId | string): Promise<Prediction | null>;
  savePrediction(prediction: Prediction): Promise<Prediction>;
  listSources(): Promise<readonly DataSourceRecord[]>;
  upsertSource(source: DataSourceRecord): Promise<DataSourceRecord>;
  listScrapingJobs(): Promise<readonly ScrapingJobRecord[]>;
  addScrapingJob(job: ScrapingJobRecord): Promise<ScrapingJobRecord>;
  listUnresolvedEntities(): Promise<readonly UnresolvedEntity[]>;
  resolveEntity(input: {
    readonly unresolvedId: string;
    readonly teamId: string;
    readonly alias: string;
  }): Promise<Team | null>;
}
