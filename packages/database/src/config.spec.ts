import { describe, expect, it } from 'vitest';
import { loadDatabaseConfig } from './config.js';

describe('loadDatabaseConfig', () => {
  it('reads DATABASE_URL and optional pool size', () => {
    // Arrange
    const env = {
      DATABASE_URL: 'postgres://localhost:5432/sports',
      DATABASE_MAX_POOL_SIZE: '5',
    };

    // Act
    const config = loadDatabaseConfig(env);

    // Assert
    expect(config).toEqual({
      database_url: 'postgres://localhost:5432/sports',
      max_pool_size: 5,
    });
  });

  it('fails when DATABASE_URL is missing', () => {
    // Arrange
    const env = {};

    // Act / Assert
    expect(() => loadDatabaseConfig(env)).toThrow('DATABASE_URL is required');
  });
});
