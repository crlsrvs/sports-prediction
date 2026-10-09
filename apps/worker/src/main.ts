import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createAppStore } from '@sports-prediction/database';
import {
  DEFAULT_JOB_OPTIONS,
  isJobSchedulerEnabled,
  JOB_SCHEDULES,
} from '@sports-prediction/shared';
import { runPipelineJob } from './pipeline.js';
import { DEFAULT_QUEUE_NAME, type JobName } from './queues.js';
import { loadRedisConfig } from './redis.js';
import { asSchedulerQueue, reconcileSchedules } from './scheduler.js';

async function bootstrap(): Promise<void> {
  const { redis_url } = loadRedisConfig();
  const connection = new Redis(redis_url, { maxRetriesPerRequest: null });
  const { store } = await createAppStore();

  const worker = new Worker(
    DEFAULT_QUEUE_NAME,
    async (job) =>
      runPipelineJob(
        job.name as JobName,
        (job.data ?? {}) as Record<string, unknown>,
        store,
      ),
    { connection },
  );

  worker.on('ready', () => {
    console.log(`Worker ready on queue "${DEFAULT_QUEUE_NAME}"`);
  });

  worker.on('completed', (job, result: { readonly detail?: string }) => {
    console.log(`Job ${job.name} completed: ${result?.detail ?? 'ok'}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`Job ${job?.name ?? 'unknown'} failed`, error);
  });

  if (isJobSchedulerEnabled()) {
    const queue = new Queue(DEFAULT_QUEUE_NAME, {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    const result = await reconcileSchedules(asSchedulerQueue(queue));
    for (const schedule of JOB_SCHEDULES) {
      console.log(`Schedule ${schedule.id}: ${schedule.name} @ ${schedule.cron} UTC`);
    }
    if (result.removed.length > 0) {
      console.log(`Removed stale schedules: ${result.removed.join(', ')}`);
    }
  } else {
    console.log('Job scheduler disabled (JOB_SCHEDULER_ENABLED=false)');
  }
}

void bootstrap();
