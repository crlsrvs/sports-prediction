import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('reports ok status and the active store mode', () => {
    // Arrange
    const controller = new HealthController({ mode: 'postgres', reason: null });

    // Act
    const result = controller.getHealth();

    // Assert
    expect(result).toEqual({ status: 'ok', store: 'postgres', storeReason: null });
  });

  it('surfaces the fallback reason when running on the memory store', () => {
    // Arrange
    const controller = new HealthController({
      mode: 'memory',
      reason: 'DATABASE_URL not set; using seeded in-memory store',
    });

    // Act
    const result = controller.getHealth();

    // Assert
    expect(result.store).toBe('memory');
    expect(result.storeReason).toContain('DATABASE_URL not set');
  });
});
