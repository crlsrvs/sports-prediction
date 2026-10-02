import { describe, expect, it } from 'vitest';
import { MemoryStore } from '@sports-prediction/database';
import { AnalysisService } from './analysis.service.js';

describe('AnalysisService', () => {
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
