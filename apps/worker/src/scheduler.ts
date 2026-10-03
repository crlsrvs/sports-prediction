import type { Queue } from 'bullmq';
import { JOB_SCHEDULES, type JobSchedule } from '@sports-prediction/shared';

export interface SchedulerQueue {
  upsertJobScheduler(
    id: string,
    repeat: { readonly pattern: string; readonly tz?: string },
    template: {
      readonly name: string;
      readonly data?: Record<string, unknown>;
      readonly opts?: { removeOnComplete?: number; removeOnFail?: number };
    },
  ): Promise<unknown>;
  getJobSchedulers(): Promise<ReadonlyArray<{ readonly key: string }>>;
  removeJobScheduler(id: string): Promise<boolean>;
}

/**
 * Makes Redis match the declared schedule list exactly: upserts every entry
 * and removes schedulers that are no longer declared, so renaming or deleting
 * an entry in code does not leave orphans firing forever.
 */
export async function reconcileSchedules(
  queue: SchedulerQueue,
  schedules: readonly JobSchedule[] = JOB_SCHEDULES,
): Promise<{ readonly upserted: string[]; readonly removed: string[] }> {
  const wanted = new Set(schedules.map((item) => item.id));
  const existing = await queue.getJobSchedulers();
  const removed: string[] = [];
  for (const scheduler of existing) {
    if (!wanted.has(scheduler.key)) {
      await queue.removeJobScheduler(scheduler.key);
      removed.push(scheduler.key);
    }
  }
  const upserted: string[] = [];
  for (const schedule of schedules) {
    await queue.upsertJobScheduler(
      schedule.id,
      { pattern: schedule.cron, tz: 'UTC' },
      {
        name: schedule.name,
        data: { ...schedule.data },
        opts: { removeOnComplete: 100, removeOnFail: 50 },
      },
    );
    upserted.push(schedule.id);
  }
  return { upserted, removed };
}

export function asSchedulerQueue(queue: Queue): SchedulerQueue {
  return queue;
}
