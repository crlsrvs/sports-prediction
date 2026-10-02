import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('returns ok status', () => {
    // Arrange
    const controller = new HealthController();

    // Act
    const result = controller.getHealth();

    // Assert
    expect(result).toEqual({ status: 'ok' });
  });
});
