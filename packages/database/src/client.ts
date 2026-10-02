import pg from 'pg';
import { loadDatabaseConfig } from './config.js';

const { Pool } = pg;

export type DbPool = pg.Pool;

export function createPool(env: NodeJS.ProcessEnv = process.env): DbPool {
  const config = loadDatabaseConfig(env);
  return new Pool({
    connectionString: config.database_url,
    max: config.max_pool_size,
  });
}
