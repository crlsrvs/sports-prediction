import {
  asPredictionId,
  type Competition,
  type Match,
  type MatchId,
  type Prediction,
  type Sport,
  type Team,
} from '@sports-prediction/domain';
import { API_FOOTBALL_SOURCE_ID } from '@sports-prediction/shared';
import { createSeedData } from './seed.js';
import type {
  AppStore,
  BacktestRunRecord,
  DataMode,
  DataSourceRecord,
  EntityAliasRecord,
  RawRecord,
  ScrapingJobRecord,
  UnresolvedEntity,
} from './types.js';

export class MemoryStore implements AppStore {
  private sports = new Map<string, Sport>();
  private competitions = new Map<string, Competition>();
  private teams = new Map<string, Team>();
  private matches = new Map<string, Match>();
  private predictions: Prediction[] = [];
  private sources = new Map<string, DataSourceRecord>();
  private jobs: ScrapingJobRecord[] = [];
  private unresolved = new Map<string, UnresolvedEntity>();
  private rawRecords: RawRecord[] = [];
  private entityAliases = new Map<string, EntityAliasRecord>();
  private backtestRuns: BacktestRunRecord[] = [];

  static seeded(): MemoryStore {
    const store = new MemoryStore();
    store.loadSeed();
    return store;
  }

  loadSeed(): void {
    const seed = createSeedData();
    for (const sport of seed.sports) this.sports.set(sport.id, sport);
    for (const competition of seed.competitions) {
      this.competitions.set(competition.id, competition);
    }
    for (const team of seed.teams) this.teams.set(team.id, team);
    for (const match of seed.matches) this.matches.set(match.id, match);
    this.predictions = [...seed.predictions];
    for (const source of seed.sources) this.sources.set(source.id, source);
    for (const item of seed.unresolved) this.unresolved.set(item.id, item);
  }

  async listSports(): Promise<readonly Sport[]> {
    return [...this.sports.values()];
  }

  async upsertSport(sport: Sport): Promise<Sport> {
    this.sports.set(sport.id, sport);
    return sport;
  }

  async listCompetitions(sportId?: string): Promise<readonly Competition[]> {
    const all = [...this.competitions.values()];
    return sportId ? all.filter((item) => item.sportId === sportId) : all;
  }

  async upsertCompetition(competition: Competition): Promise<Competition> {
    this.competitions.set(competition.id, competition);
    return competition;
  }

  async listTeams(): Promise<readonly Team[]> {
    return [...this.teams.values()];
  }

  async getTeam(id: string): Promise<Team | null> {
    return this.teams.get(id) ?? null;
  }

  async upsertTeam(team: Team): Promise<Team> {
    this.teams.set(team.id, team);
    return team;
  }

  async listMatches(): Promise<readonly Match[]> {
    return [...this.matches.values()].sort(
      (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
    );
  }

  async getMatch(id: MatchId | string): Promise<Match | null> {
    return this.matches.get(String(id)) ?? null;
  }

  async upsertMatch(match: Match): Promise<Match> {
    this.matches.set(match.id, match);
    return match;
  }

  async listPredictions(): Promise<readonly Prediction[]> {
    return [...this.predictions].sort(
      (a, b) => b.generatedAt.getTime() - a.generatedAt.getTime(),
    );
  }

  async getLatestPrediction(matchId: MatchId | string): Promise<Prediction | null> {
    const id = String(matchId);
    return (
      this.predictions
        .filter((item) => item.matchId === id)
        .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())[0] ??
      null
    );
  }

  async savePrediction(prediction: Prediction): Promise<Prediction> {
    const withId: Prediction = {
      ...prediction,
      id: prediction.id || asPredictionId(`pred-${crypto.randomUUID()}`),
    };
    this.predictions = [
      withId,
      ...this.predictions.filter((item) => item.id !== withId.id),
    ];
    return withId;
  }

  async listSources(): Promise<readonly DataSourceRecord[]> {
    return [...this.sources.values()];
  }

  async upsertSource(source: DataSourceRecord): Promise<DataSourceRecord> {
    this.sources.set(source.id, source);
    return source;
  }

  async listScrapingJobs(): Promise<readonly ScrapingJobRecord[]> {
    return [...this.jobs].sort(
      (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
    );
  }

  async addScrapingJob(job: ScrapingJobRecord): Promise<ScrapingJobRecord> {
    this.jobs = [job, ...this.jobs];
    return job;
  }

  async listUnresolvedEntities(): Promise<readonly UnresolvedEntity[]> {
    return [...this.unresolved.values()];
  }

  async addUnresolvedEntity(
    entity: UnresolvedEntity,
  ): Promise<UnresolvedEntity> {
    this.unresolved.set(entity.id, entity);
    return entity;
  }

  async resolveEntity(input: {
    readonly unresolvedId: string;
    readonly teamId: string;
    readonly alias: string;
  }): Promise<Team | null> {
    const team = this.teams.get(input.teamId);
    if (!team) return null;

    const updated: Team = {
      ...team,
      aliases: team.aliases.includes(input.alias)
        ? team.aliases
        : [...team.aliases, input.alias],
    };
    this.teams.set(updated.id, updated);
    this.unresolved.delete(input.unresolvedId);
    return updated;
  }

  async saveRawRecord(record: RawRecord): Promise<RawRecord> {
    this.rawRecords = [record, ...this.rawRecords.filter((item) => item.id !== record.id)];
    return record;
  }

  async listRawRecords(limit = 50): Promise<readonly RawRecord[]> {
    return this.rawRecords
      .slice()
      .sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime())
      .slice(0, limit);
  }

  async deleteRawRecordsOlderThan(cutoff: Date): Promise<number> {
    const before = this.rawRecords.length;
    this.rawRecords = this.rawRecords.filter(
      (item) => item.fetchedAt.getTime() >= cutoff.getTime(),
    );
    return before - this.rawRecords.length;
  }

  async listEntityAliases(): Promise<readonly EntityAliasRecord[]> {
    return [...this.entityAliases.values()];
  }

  async upsertEntityAlias(
    alias: EntityAliasRecord,
  ): Promise<EntityAliasRecord> {
    this.entityAliases.set(alias.id, alias);
    return alias;
  }

  async getDataMode(): Promise<DataMode> {
    const hasLive = [...this.matches.values()].some(
      (match) => String(match.sourceId) === API_FOOTBALL_SOURCE_ID,
    );
    return hasLive ? 'live' : 'seed';
  }

  async saveBacktestRun(run: BacktestRunRecord): Promise<BacktestRunRecord> {
    this.backtestRuns = [run, ...this.backtestRuns.filter((item) => item.id !== run.id)];
    return run;
  }

  async listBacktestRuns(limit = 20): Promise<readonly BacktestRunRecord[]> {
    return [...this.backtestRuns]
      .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime())
      .slice(0, limit);
  }
}
