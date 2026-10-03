import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { runPipelineJob } from './pipeline.js';
import { DEFAULT_QUEUE_NAME, type JobName } from './queues.js';
import { loadRedisConfig } from './redis.js';

async function bootstrap(): Promise<void> {
  const { redis_url } = loadRedisConfig();
  const connection = new Redis(redis_url, { maxRetriesPerRequest: null });

  const worker = new Worker(
    DEFAULT_QUEUE_NAME,
    async (job) =>
      runPipelineJob(
        job.name as JobName,
        (job.data ?? {}) as Record<string, unknown>,
      ),
    { connection },
  );

  worker.on('ready', () => {
    console.log(`Worker ready on queue "${DEFAULT_QUEUE_NAME}"`);
  });

  worker.on('failed', (job, error) => {
    console.error(`Job ${job?.name ?? 'unknown'} failed`, error);
  });
}

void bootstrap();
