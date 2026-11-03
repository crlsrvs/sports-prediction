import { describe, expect, it } from 'vitest';
import { MemoryStore } from '@sports-prediction/database';
import { getPredictionEngine } from '@sports-prediction/prediction';
import { AnalysisService } from './analysis.service.js';

describe('AnalysisService', () => {
  it('keeps stored features and identities when history and team names change', async () => {
    // Arrange
    const store = MemoryStore.seeded();
    const service = new AnalysisService(store);
    const original = await service.getAnalysis('match-bar-rma');
    const stored = original.prediction;
    if (!stored?.inputSnapshot) throw new Error('Expected stored engine inputs');
    const history = (await store.listMatches({ status: 'finished' }))[0];
    if (!history) throw new Error('Expected historical result');
    await store.upsertMatch({ ...history, homeScore: 50, awayScore: 0 });
    await store.upsertTeam({ ...original.homeTeam, canonicalName: 'Renamed after forecast' });

    // Act
    const later = await service.getAnalysis('match-bar-rma');
    const replay = getPredictionEngine(stored.modelVersion).predict(
      stored.inputSnapshot, stored.inputSnapshot.featureSnapshot,
    );

    // Assert
    expect(later.featureSnapshot).toEqual(original.featureSnapshot);
    expect(later.comparison).toEqual(original.comparison);
    expect(later.homeTeam).toEqual(original.homeTeam);
    expect(later.prediction).toEqual(stored);
    expect(replay).toEqual({ ok: true, value: {
      predictedScore: stored.predictedScore, expectedGoals: stored.expectedGoals,
      confidence: stored.confidence, factors: stored.factors,
      modelVersion: stored.modelVersion, outcomeProbabilities: stored.outcomeProbabilities,
    } });
  });

  it('does not invent features for a legacy prediction', async () => {
    // Arrange
    const store = MemoryStore.seeded();
    const service = new AnalysisService(store);

    // Act
    const analysis = await service.getAnalysis('match-atl-sev');

    // Assert
    expect(analysis.prediction).not.toBeNull();
    expect(analysis.prediction?.inputSnapshot).toBeNull();
    expect(analysis.featureSnapshot).toBeNull();
    expect(analysis.comparison).toEqual([]);
    expect(analysis.evaluation).not.toBeNull();
  });

  it('isolates saved snapshots from mutations through input and read references', async () => {
    // Arrange
    const store = MemoryStore.seeded();
    const service = new AnalysisService(store);
    const original = await service.getAnalysis('match-bar-rma');
    const prediction = original.prediction;
    if (!prediction?.inputSnapshot) throw new Error('Expected snapshot');
    const expected = structuredClone(prediction);

    // Act
    prediction.inputSnapshot.match.scheduledAt.setFullYear(2000);
    const read = await store.getLatestPrediction(prediction.matchId);
    if (!read?.inputSnapshot) throw new Error('Expected snapshot');
    read.inputSnapshot.dataCutoffAt.setFullYear(1999);
    const listed = await store.listPredictions();
    listed[0]?.inputSnapshot?.featureSnapshot.dataCutoffAt.setFullYear(1998);

    // Assert
    expect(await store.getLatestPrediction(prediction.matchId)).toEqual(expected);
  });

  it('captures the inputs for forced regeneration as well as initial generation', async () => {
    // Arrange
    const store = MemoryStore.seeded();
    const service = new AnalysisService(store);
    await service.getAnalysis('match-bar-rma');

    // Act
    await service.regenerateOutdatedPredictions({ force: true });

    // Assert
    const generated = (await store.listPredictions()).filter((p) => p.id !== 'pred-atl-sev');
    expect(generated.length).toBeGreaterThan(1);
    for (const prediction of generated) {
      expect(prediction.inputSnapshot?.dataCutoffAt).toEqual(prediction.dataCutoffAt);
      expect(prediction.inputSnapshot?.featureSnapshot.matchId).toBe(prediction.matchId);
    }
  });

  it('builds today cards and match analysis from seed data', async () => {
    // Arrange
    const store = MemoryStore.seeded();
    const service = new AnalysisService(store);

    // Act
    const today = await service.listTodayCards();
    const analysis = await service.getAnalysis('match-bar-rma');

    // Assert
    expect(today.length).toBeGreaterThan(0);
    expect(analysis.homeTeam.canonicalName).toBe('Barcelona');
    expect(analysis.prediction).not.toBeNull();
    expect(analysis.comparison.length).toBeGreaterThan(0);
  });
});
