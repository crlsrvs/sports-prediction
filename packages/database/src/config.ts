export interface DatabaseConfig {
  readonly database_url: string;
  readonly max_pool_size: number;
}

export function loadDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const database_url = env['DATABASE_URL'];
  if (!database_url) {
    throw new Error('DATABASE_URL is required');
  }

  const rawPool = env['DATABASE_MAX_POOL_SIZE'];
  const max_pool_size = rawPool ? Number(rawPool) : 10;

  if (!Number.isFinite(max_pool_size) || max_pool_size < 1) {
    throw new Error('DATABASE_MAX_POOL_SIZE must be a positive number');
  }

  return { database_url, max_pool_size };
}
