import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  asCompetitionId,
  asDataSourceId,
  asMatchId,
  asPredictionId,
  asSportId,
  asTeamId,
  type Competition,
  type Match,
  type MatchId,
  type MatchOutcome,
  type MatchStatus,
  type OutcomeProbabilities,
  type Prediction,
  type PredictionFactor,
  type Sport,
  type Team,
} from '@sports-prediction/domain';
import type { DbPool } from '../client.js';
import { createSeedData } from './seed.js';
import { mergeAliases } from './memoryStore.js';
import { SEED_SOURCE_ID } from '@sports-prediction/shared';
import type {
  AppStore,
  BacktestRunRecord,
  DataMode,
  DataSourceRecord,
  EntityAliasRecord,
  MatchFilter,
  PlayerAbsenceRecord,
  PredictionEvaluationFilter,
  PredictionEvaluationRecord,
  TeamLineupRecord,
  RawRecord,
  ResolveEntityResult,
  ScrapingJobRecord,
  SourceHealth,
  TeamMergeResult,
  UnresolvedEntity,
} from './types.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
// src/store and dist/store both sit two levels under the package root.
const migrationsDir = join(moduleDir, '../../migrations');

function mapSport(row: Record<string, unknown>): Sport {
  return {
    id: asSportId(String(row['id'])),
    name: String(row['name']),
    slug: String(row['slug']),
    active: Boolean(row['active']),
  };
}

function mapCompetition(row: Record<string, unknown>): Competition {
  return {
    id: asCompetitionId(String(row['id'])),
    sportId: asSportId(String(row['sport_id'])),
    name: String(row['name']),
    country: row['country'] == null ? null : String(row['country']),
    active: Boolean(row['active']),
  };
}

function mapTeam(row: Record<string, unknown>): Team {
  return {
    id: asTeamId(String(row['id'])),
    sportId: asSportId(String(row['sport_id'])),
    canonicalName: String(row['canonical_name']),
    aliases: (row['aliases'] as string[]) ?? [],
  };
}

function mapMatch(row: Record<string, unknown>): Match {
  return {
    id: asMatchId(String(row['id'])),
    sportId: asSportId(String(row['sport_id'])),
    competitionId: asCompetitionId(String(row['competition_id'])),
    seasonId: null,
    homeTeamId: asTeamId(String(row['home_team_id'])),
    awayTeamId: asTeamId(String(row['away_team_id'])),
    scheduledAt: new Date(String(row['scheduled_at'])),
    venueId: null,
    status: String(row['status']) as MatchStatus,
    homeScore: row['home_score'] == null ? null : Number(row['home_score']),
    awayScore: row['away_score'] == null ? null : Number(row['away_score']),
    sourceId: row['source_id'] == null ? null : asDataSourceId(String(row['source_id'])),
    createdAt: new Date(String(row['created_at'])),
    updatedAt: new Date(String(row['updated_at'])),
  };
}

function mapPrediction(row: Record<string, unknown>): Prediction {
  return {
    id: asPredictionId(String(row['id'])),
    matchId: asMatchId(String(row['match_id'])),
    generatedAt: new Date(String(row['generated_at'])),
    dataCutoffAt: new Date(String(row['data_cutoff_at'])),
    modelVersion: String(row['model_version']),
    predictedScore: {
      home: Number(row['predicted_home']),
      away: Number(row['predicted_away']),
    },
    expectedGoals: {
      home: Number(row['expected_home']),
      away: Number(row['expected_away']),
    },
    confidence: Number(row['confidence']),
    factors: (row['factors'] as PredictionFactor[]) ?? [],
    outcomeProbabilities:
      (row['outcome_probabilities'] as OutcomeProbabilities | null) ?? null,
  };
}

function mapUnresolved(row: Record<string, unknown>): UnresolvedEntity {
  return {
    id: String(row['id']),
    incomingName: String(row['incoming_name']),
    sourceId: asDataSourceId(String(row['source_id'])),
    createdAt: new Date(String(row['created_at'])),
    provisionalTeamId:
      row['provisional_team_id'] == null
        ? null
        : asTeamId(String(row['provisional_team_id'])),
  };
}

function mapEvaluation(row: Record<string, unknown>): PredictionEvaluationRecord {
  return {
    predictionId: String(row['prediction_id']),
    matchId: asMatchId(String(row['match_id'])),
    modelVersion: String(row['model_version']),
    competitionId: asCompetitionId(String(row['competition_id'])),
    kickoffAt: new Date(String(row['kickoff_at'])),
    generatedAt: new Date(String(row['generated_at'])),
    generatedBeforeKickoff: Boolean(row['generated_before_kickoff']),
    evaluatedAt: new Date(String(row['evaluated_at'])),
    confidence: Number(row['confidence']),
    predictedHome: Number(row['predicted_home']),
    predictedAway: Number(row['predicted_away']),
    actualHome: Number(row['actual_home']),
    actualAway: Number(row['actual_away']),
    predictedOutcome: String(row['predicted_outcome']) as MatchOutcome,
    actualOutcome: String(row['actual_outcome']) as MatchOutcome,
    exactScore: Boolean(row['exact_score']),
    winnerHit: Boolean(row['winner_hit']),
    brierScore: row['brier_score'] == null ? null : Number(row['brier_score']),
    logLoss: row['log_loss'] == null ? null : Number(row['log_loss']),
    outcomeProbabilities: parseOutcomeProbabilities(row['outcome_probabilities']),
  };
}

function parseOutcomeProbabilities(value: unknown): OutcomeProbabilities | null {
  const raw = typeof value === 'string' ? safeJson(value) : value;
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const home = Number(record['home']);
  const draw = Number(record['draw']);
  const away = Number(record['away']);
  if (![home, draw, away].every((item) => Number.isFinite(item))) return null;
  return { home, draw, away };
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function mapBacktestRun(row: Record<string, unknown>): BacktestRunRecord {
  const details = (row['details'] as Partial<BacktestRunRecord['details']> | null) ?? {};
  return {
    id: String(row['id']),
    modelVersion: String(row['model_version']),
    ranAt: new Date(String(row['ran_at'])),
    samples: Number(row['samples']),
    exactScoreRate: Number(row['exact_score_rate']),
    winnerRate: Number(row['winner_rate']),
    maeGoals: Number(row['mae_goals']),
    brierScore: row['brier_score'] == null ? null : Number(row['brier_score']),
    logLoss: row['log_loss'] == null ? null : Number(row['log_loss']),
    details: {
      rps: details.rps ?? null,
      byCompetition: details.byCompetition ?? [],
      bySeason: details.bySeason ?? [],
      baselines: (details.baselines ?? []).map((baseline) => ({
        ...baseline,
        rps: baseline.rps ?? null,
      })),
      calibration: details.calibration ?? [],
    },
  };
}

export class PostgresStore implements AppStore {
  constructor(private readonly pool: DbPool) {}

  static async migrate(pool: DbPool): Promise<void> {
    const migrationFiles = [
      '001_init.sql',
      '002_raw_and_aliases.sql',
      '003_probabilities_and_backtests.sql',
      '004_unresolved_provisional_team.sql',
      '005_prediction_evaluations.sql',
      '006_evaluation_probabilities_and_availability.sql',
    ] as const;
    for (const file of migrationFiles) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await pool.query(sql);
    }
  }

  static async seedIfEmpty(pool: DbPool): Promise<void> {
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM matches',
    );
    const count = Number(result.rows[0]?.count ?? 0);
    if (count > 0) return;

    const store = new PostgresStore(pool);
    const seed = createSeedData();
    for (const sport of seed.sports) await store.upsertSport(sport);
    for (const competition of seed.competitions) {
      await store.upsertCompetition(competition);
    }
    for (const team of seed.teams) await store.upsertTeam(team);
    for (const source of seed.sources) await store.upsertSource(source);
    for (const match of seed.matches) await store.upsertMatch(match);
    for (const prediction of seed.predictions) {
      await store.savePrediction(prediction);
    }
    for (const unresolved of seed.unresolved) {
      await store.addUnresolvedEntity(unresolved);
    }
  }

  async listSports(): Promise<readonly Sport[]> {
    const result = await this.pool.query('SELECT * FROM sports ORDER BY name');
    return result.rows.map((row) => mapSport(row));
  }

  async upsertSport(sport: Sport): Promise<Sport> {
    await this.pool.query(
      `INSERT INTO sports (id, name, slug, active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, active = EXCLUDED.active`,
      [sport.id, sport.name, sport.slug, sport.active],
    );
    return sport;
  }

  async listCompetitions(sportId?: string): Promise<readonly Competition[]> {
    const result = sportId
      ? await this.pool.query(
          'SELECT * FROM competitions WHERE sport_id = $1 ORDER BY name',
          [sportId],
        )
      : await this.pool.query('SELECT * FROM competitions ORDER BY name');
    return result.rows.map((row) => mapCompetition(row));
  }

  async upsertCompetition(competition: Competition): Promise<Competition> {
    await this.pool.query(
      `INSERT INTO competitions (id, sport_id, name, country, active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         sport_id = EXCLUDED.sport_id,
         name = EXCLUDED.name,
         country = EXCLUDED.country,
         active = EXCLUDED.active`,
      [
        competition.id,
        competition.sportId,
        competition.name,
        competition.country,
        competition.active,
      ],
    );
    return competition;
  }

  async listTeams(): Promise<readonly Team[]> {
    const result = await this.pool.query(
      'SELECT * FROM teams ORDER BY canonical_name',
    );
    return result.rows.map((row) => mapTeam(row));
  }

  async getTeam(id: string): Promise<Team | null> {
    const result = await this.pool.query('SELECT * FROM teams WHERE id = $1', [
      id,
    ]);
    const row = result.rows[0];
    return row ? mapTeam(row) : null;
  }

  async upsertTeam(team: Team): Promise<Team> {
    await this.pool.query(
      `INSERT INTO teams (id, sport_id, canonical_name, aliases)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         sport_id = EXCLUDED.sport_id,
         canonical_name = EXCLUDED.canonical_name,
         aliases = EXCLUDED.aliases`,
      [team.id, team.sportId, team.canonicalName, JSON.stringify(team.aliases)],
    );
    return team;
  }

  async listMatches(filter?: MatchFilter): Promise<readonly Match[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filter?.status) {
      values.push(filter.status);
      conditions.push(`status = $${values.length}`);
    }
    if (filter?.since) {
      values.push(filter.since);
      conditions.push(`scheduled_at >= $${values.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    let query = `SELECT * FROM matches ${where} ORDER BY scheduled_at ASC`;
    if (filter?.limit && filter.limit > 0) {
      values.push(filter.limit);
      query += ` LIMIT $${values.length}`;
    }
    const result = await this.pool.query(query, values);
    return result.rows.map((row) => mapMatch(row));
  }

  async getMatch(id: MatchId | string): Promise<Match | null> {
    const result = await this.pool.query('SELECT * FROM matches WHERE id = $1', [
      String(id),
    ]);
    const row = result.rows[0];
    return row ? mapMatch(row) : null;
  }

  async upsertMatch(match: Match): Promise<Match> {
    await this.pool.query(
      `INSERT INTO matches (
         id, sport_id, competition_id, season_id, home_team_id, away_team_id,
         scheduled_at, venue_id, status, home_score, away_score, source_id, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
       )
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         home_score = EXCLUDED.home_score,
         away_score = EXCLUDED.away_score,
         updated_at = EXCLUDED.updated_at`,
      [
        match.id,
        match.sportId,
        match.competitionId,
        match.seasonId,
        match.homeTeamId,
        match.awayTeamId,
        match.scheduledAt.toISOString(),
        match.venueId,
        match.status,
        match.homeScore,
        match.awayScore,
        match.sourceId,
        match.createdAt.toISOString(),
        match.updatedAt.toISOString(),
      ],
    );
    return match;
  }

  async listPredictions(): Promise<readonly Prediction[]> {
    const result = await this.pool.query(
      'SELECT * FROM predictions ORDER BY generated_at DESC',
    );
    return result.rows.map((row) => mapPrediction(row));
  }

  async getLatestPrediction(matchId: MatchId | string): Promise<Prediction | null> {
    const result = await this.pool.query(
      `SELECT * FROM predictions
       WHERE match_id = $1
       ORDER BY generated_at DESC
       LIMIT 1`,
      [String(matchId)],
    );
    const row = result.rows[0];
    return row ? mapPrediction(row) : null;
  }

  async savePrediction(prediction: Prediction): Promise<Prediction> {
    await this.pool.query(
      `INSERT INTO predictions (
         id, match_id, generated_at, data_cutoff_at, model_version,
         predicted_home, predicted_away, expected_home, expected_away, confidence, factors,
         outcome_probabilities
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb
       )
       ON CONFLICT (id) DO UPDATE SET
         predicted_home = EXCLUDED.predicted_home,
         predicted_away = EXCLUDED.predicted_away,
         confidence = EXCLUDED.confidence,
         factors = EXCLUDED.factors,
         outcome_probabilities = EXCLUDED.outcome_probabilities`,
      [
        prediction.id,
        prediction.matchId,
        prediction.generatedAt.toISOString(),
        prediction.dataCutoffAt.toISOString(),
        prediction.modelVersion,
        prediction.predictedScore.home,
        prediction.predictedScore.away,
        prediction.expectedGoals.home,
        prediction.expectedGoals.away,
        prediction.confidence,
        JSON.stringify(prediction.factors),
        prediction.outcomeProbabilities
          ? JSON.stringify(prediction.outcomeProbabilities)
          : null,
      ],
    );
    return prediction;
  }

  async saveBacktestRun(run: BacktestRunRecord): Promise<BacktestRunRecord> {
    await this.pool.query(
      `INSERT INTO backtest_runs (
         id, model_version, ran_at, samples, exact_score_rate, winner_rate,
         mae_goals, brier_score, log_loss, details
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        run.id,
        run.modelVersion,
        run.ranAt.toISOString(),
        run.samples,
        run.exactScoreRate,
        run.winnerRate,
        run.maeGoals,
        run.brierScore,
        run.logLoss,
        JSON.stringify(run.details),
      ],
    );
    return run;
  }

  async listBacktestRuns(limit = 20): Promise<readonly BacktestRunRecord[]> {
    const result = await this.pool.query(
      'SELECT * FROM backtest_runs ORDER BY ran_at DESC LIMIT $1',
      [limit],
    );
    return result.rows.map((row) => mapBacktestRun(row));
  }

  async savePredictionEvaluation(
    record: PredictionEvaluationRecord,
  ): Promise<PredictionEvaluationRecord> {
    await this.pool.query(
      `INSERT INTO prediction_evaluations (
         prediction_id, match_id, model_version, competition_id, kickoff_at,
         generated_at, generated_before_kickoff, evaluated_at, confidence,
         predicted_home, predicted_away, actual_home, actual_away,
         predicted_outcome, actual_outcome, exact_score, winner_hit,
         brier_score, log_loss, outcome_probabilities
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
       )
       ON CONFLICT (prediction_id) DO UPDATE SET
         actual_home = EXCLUDED.actual_home,
         actual_away = EXCLUDED.actual_away,
         actual_outcome = EXCLUDED.actual_outcome,
         exact_score = EXCLUDED.exact_score,
         winner_hit = EXCLUDED.winner_hit,
         brier_score = EXCLUDED.brier_score,
         log_loss = EXCLUDED.log_loss,
         evaluated_at = EXCLUDED.evaluated_at,
         outcome_probabilities = COALESCE(
           EXCLUDED.outcome_probabilities,
           prediction_evaluations.outcome_probabilities
         )`,
      [
        record.predictionId,
        record.matchId,
        record.modelVersion,
        record.competitionId,
        record.kickoffAt.toISOString(),
        record.generatedAt.toISOString(),
        record.generatedBeforeKickoff,
        record.evaluatedAt.toISOString(),
        record.confidence,
        record.predictedHome,
        record.predictedAway,
        record.actualHome,
        record.actualAway,
        record.predictedOutcome,
        record.actualOutcome,
        record.exactScore,
        record.winnerHit,
        record.brierScore,
        record.logLoss,
        record.outcomeProbabilities
          ? JSON.stringify(record.outcomeProbabilities)
          : null,
      ],
    );
    return record;
  }

  async listPredictionEvaluations(
    filter: PredictionEvaluationFilter = {},
  ): Promise<readonly PredictionEvaluationRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.modelVersion) {
      params.push(filter.modelVersion);
      conditions.push(`model_version = $${params.length}`);
    }
    if (filter.since) {
      params.push(filter.since.toISOString());
      conditions.push(`kickoff_at >= $${params.length}`);
    }
    if (filter.liveOnly) conditions.push('generated_before_kickoff = TRUE');
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.pool.query(
      `SELECT * FROM prediction_evaluations ${where} ORDER BY kickoff_at DESC`,
      params,
    );
    return result.rows.map((row) => mapEvaluation(row));
  }

  async listSources(): Promise<readonly DataSourceRecord[]> {
    const result = await this.pool.query('SELECT * FROM data_sources ORDER BY name');
    return result.rows.map((row) => ({
      id: asDataSourceId(String(row['id'])),
      name: String(row['name']),
      kind: String(row['kind']) as DataSourceRecord['kind'],
      active: Boolean(row['active']),
      health: String(row['health']) as SourceHealth,
      lastSuccessAt: row['last_success_at']
        ? new Date(String(row['last_success_at']))
        : null,
      lastFailureAt: row['last_failure_at']
        ? new Date(String(row['last_failure_at']))
        : null,
      consecutiveFailures: Number(row['consecutive_failures']),
    }));
  }

  async upsertSource(source: DataSourceRecord): Promise<DataSourceRecord> {
    await this.pool.query(
      `INSERT INTO data_sources (
         id, name, kind, active, health, last_success_at, last_failure_at, consecutive_failures
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         kind = EXCLUDED.kind,
         active = EXCLUDED.active,
         health = EXCLUDED.health,
         last_success_at = EXCLUDED.last_success_at,
         last_failure_at = EXCLUDED.last_failure_at,
         consecutive_failures = EXCLUDED.consecutive_failures`,
      [
        source.id,
        source.name,
        source.kind,
        source.active,
        source.health,
        source.lastSuccessAt?.toISOString() ?? null,
        source.lastFailureAt?.toISOString() ?? null,
        source.consecutiveFailures,
      ],
    );
    return source;
  }

  async listScrapingJobs(): Promise<readonly ScrapingJobRecord[]> {
    const result = await this.pool.query(
      'SELECT * FROM scraping_jobs ORDER BY started_at DESC',
    );
    return result.rows.map((row) => ({
      id: String(row['id']),
      sourceId: asDataSourceId(String(row['source_id'])),
      startedAt: new Date(String(row['started_at'])),
      finishedAt: row['finished_at']
        ? new Date(String(row['finished_at']))
        : null,
      status: String(row['status']) as ScrapingJobRecord['status'],
      recordsFound: Number(row['records_found']),
      recordsProcessed: Number(row['records_processed']),
      recordsFailed: Number(row['records_failed']),
      error: row['error'] == null ? null : String(row['error']),
    }));
  }

  async addScrapingJob(job: ScrapingJobRecord): Promise<ScrapingJobRecord> {
    await this.pool.query(
      `INSERT INTO scraping_jobs (
         id, source_id, started_at, finished_at, status,
         records_found, records_processed, records_failed, error
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        job.id,
        job.sourceId,
        job.startedAt.toISOString(),
        job.finishedAt?.toISOString() ?? null,
        job.status,
        job.recordsFound,
        job.recordsProcessed,
        job.recordsFailed,
        job.error,
      ],
    );
    return job;
  }

  async listUnresolvedEntities(): Promise<readonly UnresolvedEntity[]> {
    const result = await this.pool.query(
      'SELECT * FROM unresolved_entities ORDER BY created_at DESC',
    );
    return result.rows.map((row) => mapUnresolved(row));
  }

  async addUnresolvedEntity(
    entity: UnresolvedEntity,
  ): Promise<UnresolvedEntity> {
    await this.pool.query(
      `INSERT INTO unresolved_entities (
         id, incoming_name, source_id, created_at, provisional_team_id
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        entity.id,
        entity.incomingName,
        entity.sourceId,
        entity.createdAt.toISOString(),
        entity.provisionalTeamId,
      ],
    );
    return entity;
  }

  async resolveEntity(input: {
    readonly unresolvedId: string;
    readonly teamId: string;
    readonly alias: string;
  }): Promise<ResolveEntityResult | null> {
    const team = await this.getTeam(input.teamId);
    if (!team) return null;

    const pendingResult = await this.pool.query(
      'SELECT * FROM unresolved_entities WHERE id = $1',
      [input.unresolvedId],
    );
    const pendingRow = pendingResult.rows[0];
    const pending = pendingRow ? mapUnresolved(pendingRow) : null;
    const provisionalId = pending?.provisionalTeamId ?? null;

    let merged: TeamMergeResult | null = null;
    if (provisionalId && String(provisionalId) !== input.teamId) {
      merged = await this.mergeTeams({
        sourceTeamId: String(provisionalId),
        targetTeamId: input.teamId,
      });
    }

    const current = (await this.getTeam(input.teamId)) ?? team;
    const updated: Team = {
      ...current,
      aliases: current.aliases.includes(input.alias)
        ? current.aliases
        : [...current.aliases, input.alias],
    };
    await this.upsertTeam(updated);
    await this.pool.query('DELETE FROM unresolved_entities WHERE id = $1', [
      input.unresolvedId,
    ]);
    return {
      team: updated,
      mergedTeamId: merged?.mergedTeamId ?? null,
      movedMatches: merged?.movedMatches ?? 0,
    };
  }

  async mergeTeams(input: {
    readonly sourceTeamId: string;
    readonly targetTeamId: string;
  }): Promise<TeamMergeResult | null> {
    if (input.sourceTeamId === input.targetTeamId) return null;
    const [source, target] = await Promise.all([
      this.getTeam(input.sourceTeamId),
      this.getTeam(input.targetTeamId),
    ]);
    if (!source || !target) return null;

    const updated: Team = { ...target, aliases: mergeAliases(target, source) };
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const home = await client.query(
        'UPDATE matches SET home_team_id = $1 WHERE home_team_id = $2',
        [target.id, source.id],
      );
      const away = await client.query(
        'UPDATE matches SET away_team_id = $1 WHERE away_team_id = $2',
        [target.id, source.id],
      );
      await client.query(
        'UPDATE entity_aliases SET team_id = $1 WHERE team_id = $2',
        [target.id, source.id],
      );
      await client.query(
        'UPDATE unresolved_entities SET provisional_team_id = $1 WHERE provisional_team_id = $2',
        [target.id, source.id],
      );
      await client.query(
        'UPDATE teams SET aliases = $1::jsonb WHERE id = $2',
        [JSON.stringify(updated.aliases), target.id],
      );
      await client.query('DELETE FROM teams WHERE id = $1', [source.id]);
      await client.query('COMMIT');
      return {
        team: updated,
        mergedTeamId: source.id,
        movedMatches: (home.rowCount ?? 0) + (away.rowCount ?? 0),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async saveRawRecord(record: RawRecord): Promise<RawRecord> {
    await this.pool.query(
      `INSERT INTO raw_records (
         id, source_id, url, fetched_at, status_code, content_type, payload, checksum, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         payload = EXCLUDED.payload,
         checksum = EXCLUDED.checksum,
         fetched_at = EXCLUDED.fetched_at`,
      [
        record.id,
        record.sourceId,
        record.url,
        record.fetchedAt.toISOString(),
        record.statusCode,
        record.contentType,
        record.payload,
        record.checksum,
        JSON.stringify(record.metadata),
      ],
    );
    return record;
  }

  async listRawRecords(limit = 50): Promise<readonly RawRecord[]> {
    const result = await this.pool.query(
      'SELECT * FROM raw_records ORDER BY fetched_at DESC LIMIT $1',
      [limit],
    );
    return result.rows.map((row) => ({
      id: String(row['id']),
      sourceId: asDataSourceId(String(row['source_id'])),
      url: String(row['url']),
      fetchedAt: new Date(String(row['fetched_at'])),
      statusCode: Number(row['status_code']),
      contentType:
        row['content_type'] == null ? null : String(row['content_type']),
      payload: String(row['payload']),
      checksum: String(row['checksum']),
      metadata: (row['metadata'] as Record<string, string>) ?? {},
    }));
  }

  async deleteRawRecordsOlderThan(cutoff: Date): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM raw_records WHERE fetched_at < $1',
      [cutoff.toISOString()],
    );
    return result.rowCount ?? 0;
  }

  async listEntityAliases(): Promise<readonly EntityAliasRecord[]> {
    const result = await this.pool.query(
      'SELECT * FROM entity_aliases ORDER BY created_at DESC',
    );
    return result.rows.map((row) => ({
      id: String(row['id']),
      teamId: asTeamId(String(row['team_id'])),
      alias: String(row['alias']),
      sourceId:
        row['source_id'] == null
          ? null
          : asDataSourceId(String(row['source_id'])),
      createdAt: new Date(String(row['created_at'])),
    }));
  }

  async upsertEntityAlias(
    alias: EntityAliasRecord,
  ): Promise<EntityAliasRecord> {
    await this.pool.query(
      `INSERT INTO entity_aliases (id, team_id, alias, source_id, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (alias, source_id) DO UPDATE SET
         team_id = EXCLUDED.team_id`,
      [
        alias.id,
        alias.teamId,
        alias.alias,
        alias.sourceId,
        alias.createdAt.toISOString(),
      ],
    );
    return alias;
  }

  async getDataMode(): Promise<DataMode> {
    const result = await this.pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM matches WHERE source_id <> $1',
      [SEED_SOURCE_ID],
    );
    return Number(result.rows[0]?.count ?? 0) > 0 ? 'live' : 'seed';
  }

  async upsertPlayerAbsences(records: readonly PlayerAbsenceRecord[]): Promise<number> {
    for (const record of records) {
      await this.pool.query(
        `INSERT INTO player_absences (
           id, team_id, player_name, reason, match_day, known_at, source_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           reason = EXCLUDED.reason,
           known_at = LEAST(player_absences.known_at, EXCLUDED.known_at)`,
        [
          record.id,
          record.teamId,
          record.playerName,
          record.reason,
          record.matchDay.toISOString(),
          record.knownAt.toISOString(),
          record.sourceId,
        ],
      );
    }
    return records.length;
  }

  async listPlayerAbsences(): Promise<readonly PlayerAbsenceRecord[]> {
    const result = await this.pool.query(
      'SELECT * FROM player_absences ORDER BY match_day DESC',
    );
    return result.rows.map((row) => ({
      id: String(row['id']),
      teamId: asTeamId(String(row['team_id'])),
      playerName: String(row['player_name']),
      reason: String(row['reason']),
      matchDay: new Date(String(row['match_day'])),
      knownAt: new Date(String(row['known_at'])),
      sourceId: asDataSourceId(String(row['source_id'])),
    }));
  }

  async upsertTeamLineups(records: readonly TeamLineupRecord[]): Promise<number> {
    for (const record of records) {
      await this.pool.query(
        `INSERT INTO team_lineups (
           id, team_id, match_day, known_at, source_id, player_names
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           player_names = EXCLUDED.player_names,
           known_at = LEAST(team_lineups.known_at, EXCLUDED.known_at)`,
        [
          record.id,
          record.teamId,
          record.matchDay.toISOString(),
          record.knownAt.toISOString(),
          record.sourceId,
          JSON.stringify(record.playerNames),
        ],
      );
    }
    return records.length;
  }

  async listTeamLineups(): Promise<readonly TeamLineupRecord[]> {
    const result = await this.pool.query(
      'SELECT * FROM team_lineups ORDER BY match_day DESC',
    );
    return result.rows.map((row) => ({
      id: String(row['id']),
      teamId: asTeamId(String(row['team_id'])),
      matchDay: new Date(String(row['match_day'])),
      knownAt: new Date(String(row['known_at'])),
      sourceId: asDataSourceId(String(row['source_id'])),
      playerNames: parsePlayerNames(row['player_names']),
    }));
  }
}

function parsePlayerNames(value: unknown): readonly string[] {
  const raw = typeof value === 'string' ? safeJson(value) : value;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}
