export interface RedisConfig {
  readonly redis_url: string;
}

export function loadRedisConfig(
  env: NodeJS.ProcessEnv = process.env,
): RedisConfig {
  const redis_url = env['REDIS_URL'] ?? 'redis://127.0.0.1:6379';
  return { redis_url };
}
