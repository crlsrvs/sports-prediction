import { describe, expect, it } from 'vitest';
import { createPool, MemoryStore, PostgresStore } from '@sports-prediction/database';
import { asMatchId } from '@sports-prediction/domain';
import { getPredictionEngine } from '@sports-prediction/prediction';
import { runPipelineJob } from './pipeline.js';
import { JOB_NAMES } from './queues.js';

describe('prediction pipeline provenance', () => {
  it.skipIf(!process.env['TEST_DATABASE_URL'])('persists replayable worker inputs in PostgreSQL', async () => {
    // Arrange
    const databaseUrl = process.env['TEST_DATABASE_URL'];
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
    const schema = `worker_snapshot_${crypto.randomUUID().replaceAll('-', '')}`;
    const adminPool = createPool({ DATABASE_URL: databaseUrl });
    const scopedUrl = new URL(databaseUrl);
    scopedUrl.searchParams.set('options', `-csearch_path=${schema}`);
    const pool = createPool({ DATABASE_URL: scopedUrl.toString() });
    try {
      await adminPool.query(`CREATE SCHEMA ${schema}`);
      await PostgresStore.migrate(pool);
      await PostgresStore.seedIfEmpty(pool);
      const store = new PostgresStore(pool);
      const fixture = await store.getMatch('match-bar-rma');
      if (!fixture) throw new Error('Expected fixture');
      const id = asMatchId('postgres-worker-snapshot');
      await store.upsertMatch({
        ...fixture, id, status: 'scheduled',
        scheduledAt: new Date(Date.now() + 86_400_000),
      });

      // Act
      await runPipelineJob(JOB_NAMES.GENERATE_PREDICTIONS, {}, store);
      const prediction = await store.getLatestPrediction(id);

      // Assert
      if (!prediction?.inputSnapshot) throw new Error('Expected worker snapshot');
      const replay = getPredictionEngine(prediction.modelVersion).predict(
        prediction.inputSnapshot, prediction.inputSnapshot.featureSnapshot,
      );
      expect(replay).toEqual({ ok: true, value: {
        modelVersion: prediction.modelVersion, predictedScore: prediction.predictedScore,
        expectedGoals: prediction.expectedGoals, confidence: prediction.confidence,
        factors: prediction.factors, outcomeProbabilities: prediction.outcomeProbabilities,
      } });
    } finally {
      await pool.end();
      await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await adminPool.end();
    }
  });

  it('persists replayable engine inputs when the worker generates a prediction', async () => {
    // Arrange
    const store = MemoryStore.seeded();
    const fixture = await store.getMatch('match-bar-rma');
    if (!fixture) throw new Error('Expected seed fixture');
    const matchId = asMatchId('worker-snapshot');
    await store.upsertMatch({
      ...fixture, id: matchId, status: 'scheduled',
      scheduledAt: new Date(Date.now() + 86_400_000),
    });

    // Act
    await runPipelineJob(JOB_NAMES.GENERATE_PREDICTIONS, {}, store);
    const prediction = await store.getLatestPrediction(matchId);

    // Assert
    if (!prediction?.inputSnapshot) throw new Error('Expected persisted inputs');
    const replay = getPredictionEngine(prediction.modelVersion).predict(
      prediction.inputSnapshot, prediction.inputSnapshot.featureSnapshot,
    );
    expect(replay).toEqual({ ok: true, value: {
      modelVersion: prediction.modelVersion, predictedScore: prediction.predictedScore,
      expectedGoals: prediction.expectedGoals, confidence: prediction.confidence,
      factors: prediction.factors, outcomeProbabilities: prediction.outcomeProbabilities,
    } });
  });
});
