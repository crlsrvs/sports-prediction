import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  DEFAULT_QUEUE_NAME,
  type JobName,
} from '@sports-prediction/shared';

let queue: Queue | null = null;

function getQueue(): Queue {
  if (!queue) {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379';
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue(DEFAULT_QUEUE_NAME, { connection });
  }
  return queue;
}

export async function enqueueJob(
  name: JobName,
  data: Record<string, unknown> = {},
): Promise<{ readonly jobId: string; readonly name: JobName }> {
  const job = await getQueue().add(name, data, {
    removeOnComplete: 100,
    removeOnFail: 50,
  });
  return { jobId: String(job.id), name };
}
