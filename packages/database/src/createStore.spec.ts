import { describe, expect, it, vi } from 'vitest';
import { createAppStore, StoreConnectionError } from './createStore.js';
import { MemoryStore } from './store/memoryStore.js';

describe('createAppStore', () => {
  it('uses the seeded memory store when DATABASE_URL is not set', async () => {
    // Arrange
    const warn = vi.fn<(message: string) => void>();
    const connectPostgres = vi.fn<() => Promise<MemoryStore>>();

    // Act
    const result = await createAppStore({}, { connectPostgres, warn });

    // Assert
    expect(result.mode).toBe('memory');
    expect(result.reason).toContain('DATABASE_URL not set');
    expect(connectPostgres).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('uses PostgreSQL when the connection succeeds', async () => {
    // Arrange
    const store = MemoryStore.seeded();
    const connectPostgres = vi.fn(async () => store);

    // Act
    const result = await createAppStore(
      { DATABASE_URL: 'postgres://x' },
      { connectPostgres, warn: () => undefined },
    );

    // Assert
    expect(result).toEqual({ store, mode: 'postgres', reason: null });
  });

  it('fails loudly when PostgreSQL is unreachable', async () => {
    // Arrange
    const connectPostgres = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });

    // Act
    const attempt = createAppStore(
      { DATABASE_URL: 'postgres://x' },
      { connectPostgres, warn: () => undefined },
    );

    // Assert
    await expect(attempt).rejects.toBeInstanceOf(StoreConnectionError);
    await expect(attempt).rejects.toThrow(/ECONNREFUSED/);
  });

  it('falls back to memory with a warning only when explicitly allowed', async () => {
    // Arrange
    const warn = vi.fn<(message: string) => void>();
    const connectPostgres = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });

    // Act
    const result = await createAppStore(
      { DATABASE_URL: 'postgres://x', STORE_ALLOW_MEMORY_FALLBACK: 'true' },
      { connectPostgres, warn },
    );

    // Assert
    expect(result.mode).toBe('memory');
    expect(result.reason).toContain('ECONNREFUSED');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('STORE_ALLOW_MEMORY_FALLBACK'));
  });
});
