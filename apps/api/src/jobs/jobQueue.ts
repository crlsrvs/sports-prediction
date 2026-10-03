import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  DEFAULT_QUEUE_NAME,
  JOB_SCHEDULES,
  type JobName,
} from '@sports-prediction/shared';

export interface ScheduleStatus {
  readonly id: string;
  readonly name: string;
  readonly cron: string;
  readonly description: string;
  /** ISO timestamp of the next planned run, or null if not registered in Redis. */
  readonly nextRunAt: string | null;
  readonly registered: boolean;
}

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

/** Declared schedules merged with what the worker actually registered in Redis. */
export async function listSchedules(): Promise<readonly ScheduleStatus[]> {
  const registered = await getQueue().getJobSchedulers();
  const byKey = new Map(registered.map((item) => [item.key, item]));
  return JOB_SCHEDULES.map((schedule) => {
    const live = byKey.get(schedule.id);
    return {
      id: schedule.id,
      name: schedule.name,
      cron: schedule.cron,
      description: schedule.description,
      nextRunAt: live?.next ? new Date(live.next).toISOString() : null,
      registered: live !== undefined,
    };
  });
}
