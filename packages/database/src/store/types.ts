import type {
  Competition,
  DataSourceId,
  Match,
  MatchId,
  Prediction,
  Sport,
  Team,
  TeamId,
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
  readonly status: 'queued' | 'running' | 'success' | 'partial' | 'failed' | 'skipped';
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

export interface RawRecord {
  readonly id: string;
  readonly sourceId: DataSourceId;
  readonly url: string;
  readonly fetchedAt: Date;
  readonly statusCode: number;
  readonly contentType: string | null;
  readonly payload: string;
  readonly checksum: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface EntityAliasRecord {
  readonly id: string;
  readonly teamId: TeamId;
  readonly alias: string;
  readonly sourceId: DataSourceId | null;
  readonly createdAt: Date;
}

export type DataMode = 'seed' | 'live';

export interface BacktestCompetitionMetrics {
  readonly competitionId: string;
  readonly competitionName: string;
  readonly samples: number;
  readonly winnerRate: number;
  readonly exactScoreRate: number;
  readonly brierScore: number | null;
}

export interface BacktestBaselineMetrics {
  readonly label: string;
  readonly winnerRate: number;
  readonly brierScore: number;
  readonly logLoss: number;
}

export interface BacktestCalibrationBucket {
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly samples: number;
  readonly averageConfidence: number;
  readonly observedAccuracy: number;
}

export interface BacktestRunRecord {
  readonly id: string;
  readonly modelVersion: string;
  readonly ranAt: Date;
  readonly samples: number;
  readonly exactScoreRate: number;
  readonly winnerRate: number;
  readonly maeGoals: number;
  readonly brierScore: number | null;
  readonly logLoss: number | null;
  readonly details: {
    readonly byCompetition: readonly BacktestCompetitionMetrics[];
    readonly baselines: readonly BacktestBaselineMetrics[];
    readonly calibration: readonly BacktestCalibrationBucket[];
  };
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
  addUnresolvedEntity(entity: UnresolvedEntity): Promise<UnresolvedEntity>;
  resolveEntity(input: {
    readonly unresolvedId: string;
    readonly teamId: string;
    readonly alias: string;
  }): Promise<Team | null>;
  saveRawRecord(record: RawRecord): Promise<RawRecord>;
  listRawRecords(limit?: number): Promise<readonly RawRecord[]>;
  deleteRawRecordsOlderThan(cutoff: Date): Promise<number>;
  listEntityAliases(): Promise<readonly EntityAliasRecord[]>;
  upsertEntityAlias(alias: EntityAliasRecord): Promise<EntityAliasRecord>;
  getDataMode(): Promise<DataMode>;
  saveBacktestRun(run: BacktestRunRecord): Promise<BacktestRunRecord>;
  listBacktestRuns(limit?: number): Promise<readonly BacktestRunRecord[]>;
}
