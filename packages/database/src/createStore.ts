import { createPool } from './client.js';
import { MemoryStore } from './store/memoryStore.js';
import { PostgresStore } from './store/postgresStore.js';
import type { AppStore } from './store/types.js';

export type StoreMode = 'postgres' | 'memory';

export interface CreateStoreResult {
  readonly store: AppStore;
  readonly mode: StoreMode;
  /** Why we ended up in memory; null when PostgreSQL is in use. */
  readonly reason: string | null;
}

export class StoreConnectionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StoreConnectionError';
  }
}

export interface CreateStoreDeps {
  readonly connectPostgres: (env: NodeJS.ProcessEnv) => Promise<AppStore>;
  readonly warn: (message: string) => void;
}

async function connectPostgres(env: NodeJS.ProcessEnv): Promise<AppStore> {
  const pool = createPool(env);
  try {
    await pool.query('SELECT 1');
    await PostgresStore.migrate(pool);
    await PostgresStore.seedIfEmpty(pool);
    return new PostgresStore(pool);
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
}

const DEFAULT_DEPS: CreateStoreDeps = {
  connectPostgres,
  warn: (message) => console.warn(message),
};

function isTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes((value ?? '').trim().toLowerCase());
}

/**
 * Store selection rules:
 * - No `DATABASE_URL`: seeded in-memory store (explicit demo mode).
 * - `DATABASE_URL` set and reachable: PostgreSQL.
 * - `DATABASE_URL` set but unreachable: throws `StoreConnectionError`, unless
 *   `STORE_ALLOW_MEMORY_FALLBACK` is truthy, in which case we fall back to
 *   memory and warn loudly. Silent fallbacks hid real outages behind demo data.
 */
export async function createAppStore(
  env: NodeJS.ProcessEnv = process.env,
  deps: CreateStoreDeps = DEFAULT_DEPS,
): Promise<CreateStoreResult> {
  if (!env['DATABASE_URL']) {
    const reason = 'DATABASE_URL not set; using seeded in-memory store';
    deps.warn(`[store] ${reason}`);
    return { store: MemoryStore.seeded(), mode: 'memory', reason };
  }

  try {
    const store = await deps.connectPostgres(env);
    return { store, mode: 'postgres', reason: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (isTruthy(env['STORE_ALLOW_MEMORY_FALLBACK'])) {
      const reason = `PostgreSQL unavailable (${detail}); STORE_ALLOW_MEMORY_FALLBACK is set, using seeded in-memory store`;
      deps.warn(`[store] ${reason}`);
      return { store: MemoryStore.seeded(), mode: 'memory', reason };
    }
    throw new StoreConnectionError(
      `PostgreSQL unavailable (${detail}). Fix DATABASE_URL, start the database, or set STORE_ALLOW_MEMORY_FALLBACK=true for demo mode.`,
      { cause: error },
    );
  }
}
