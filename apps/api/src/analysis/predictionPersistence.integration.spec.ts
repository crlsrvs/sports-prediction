import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, createSeedData, PostgresStore, type DbPool } from '@sports-prediction/database';
import { getPredictionEngine } from '@sports-prediction/prediction';
import { AnalysisService } from './analysis.service.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];

// Never reads DATABASE_URL: each run owns a separate schema in a test database.
describe.skipIf(!databaseUrl)('prediction inputs in PostgreSQL', () => {
  const schema = `alpha_snapshot_${crypto.randomUUID().replaceAll('-', '')}`;
  let adminPool: DbPool;
  let pool: DbPool;
  let store: PostgresStore;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
    adminPool = createPool({ DATABASE_URL: databaseUrl });
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    const scopedUrl = new URL(databaseUrl);
    scopedUrl.searchParams.set('options', `-csearch_path=${schema}`);
    pool = createPool({ DATABASE_URL: scopedUrl.toString() });
    store = new PostgresStore(pool);

    // Create a genuine pre-007 row, then upgrade the schema without backfill.
    const migrations = new URL('../../../../packages/database/migrations/', import.meta.url);
    for (const file of readdirSync(migrations).filter((name) => /^00[1-6]_.*\.sql$/.test(name)).sort()) {
      await pool.query(readFileSync(new URL(file, migrations), 'utf8'));
    }
    const seed = createSeedData();
    for (const sport of seed.sports) await store.upsertSport(sport);
    for (const competition of seed.competitions) await store.upsertCompetition(competition);
    for (const team of seed.teams) await store.upsertTeam(team);
    for (const source of seed.sources) await store.upsertSource(source);
    for (const match of seed.matches) await store.upsertMatch(match);
    await pool.query(`INSERT INTO predictions
      (id, match_id, generated_at, data_cutoff_at, model_version,
       predicted_home, predicted_away, expected_home, expected_away, confidence)
      VALUES ('legacy-before-007', 'match-atl-sev', now(), now(), 'football-v1', 2, 1, 2.1, 1.2, 60)`);
    await PostgresStore.migrate(pool);
    await PostgresStore.migrate(pool);
  }, 30_000);

  afterAll(async () => {
    if (pool) await pool.end();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await adminPool.end();
    }
  });

  it('preserves legacy output without fabricating a snapshot during migration', async () => {
    // Arrange
    const service = new AnalysisService(store);

    // Act
    const analysis = await service.getAnalysis('match-atl-sev');

    // Assert
    expect(analysis.prediction?.id).toBe('legacy-before-007');
    expect(analysis.prediction?.predictedScore).toEqual({ home: 2, away: 1 });
    expect(analysis.prediction?.inputSnapshot).toBeNull();
    expect(analysis.featureSnapshot).toBeNull();
    expect(analysis.comparison).toEqual([]);
  });

  it('round-trips API inputs and replays after history and identities change', async () => {
    // Arrange
    const service = new AnalysisService(store);
    const original = await service.getAnalysis('match-bar-rma');
    const stored = await store.getLatestPrediction('match-bar-rma');
    if (!stored?.inputSnapshot) throw new Error('Expected persisted snapshot');
    const history = (await store.listMatches({ status: 'finished' }))[0];
    if (!history) throw new Error('Expected history');
    await store.upsertMatch({ ...history, homeScore: 20, awayScore: 19 });
    await store.upsertTeam({ ...original.homeTeam, canonicalName: 'Changed after generation' });

    // Act
    const later = await service.getAnalysis('match-bar-rma');
    const context = stored.inputSnapshot;
    const replay = getPredictionEngine(stored.modelVersion).predict(context, context.featureSnapshot);

    // Assert
    expect(stored).toEqual(original.prediction);
    expect(context.match.scheduledAt).toBeInstanceOf(Date);
    expect(context.match.createdAt).toBeInstanceOf(Date);
    expect(context.match.updatedAt).toBeInstanceOf(Date);
    expect(context.dataCutoffAt).toBeInstanceOf(Date);
    expect(context.featureSnapshot.dataCutoffAt).toBeInstanceOf(Date);
    expect(later.featureSnapshot).toEqual(original.featureSnapshot);
    expect(later.comparison).toEqual(original.comparison);
    expect(later.homeTeam).toEqual(original.homeTeam);
    expect(replay).toEqual({ ok: true, value: {
      predictedScore: stored.predictedScore, expectedGoals: stored.expectedGoals,
      confidence: stored.confidence, factors: stored.factors,
      modelVersion: stored.modelVersion, outcomeProbabilities: stored.outcomeProbabilities,
    } });
  });

});
