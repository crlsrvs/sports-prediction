import { createPool } from './client.js';
import { MemoryStore } from './store/memoryStore.js';
import { PostgresStore } from './store/postgresStore.js';
import type { AppStore } from './store/types.js';

export interface CreateStoreResult {
  readonly store: AppStore;
  readonly mode: 'postgres' | 'memory';
}

/**
 * Prefers PostgreSQL when DATABASE_URL is reachable; otherwise seeds an in-memory store.
 */
export async function createAppStore(
  env: NodeJS.ProcessEnv = process.env,
): Promise<CreateStoreResult> {
  if (!env['DATABASE_URL']) {
    return { store: MemoryStore.seeded(), mode: 'memory' };
  }

  const pool = createPool(env);
  try {
    await pool.query('SELECT 1');
    await PostgresStore.migrate(pool);
    await PostgresStore.seedIfEmpty(pool);
    return { store: new PostgresStore(pool), mode: 'postgres' };
  } catch {
    await pool.end().catch(() => undefined);
    return { store: MemoryStore.seeded(), mode: 'memory' };
  }
}
