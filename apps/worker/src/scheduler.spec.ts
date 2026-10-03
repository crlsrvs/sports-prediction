import { describe, expect, it } from 'vitest';
import type { JobSchedule } from '@sports-prediction/shared';
import { reconcileSchedules, type SchedulerQueue } from './scheduler.js';

function fakeQueue(existingKeys: string[]): SchedulerQueue & {
  readonly upserts: Array<{ id: string; pattern: string; name: string }>;
  readonly removals: string[];
} {
  const upserts: Array<{ id: string; pattern: string; name: string }> = [];
  const removals: string[] = [];
  return {
    upserts,
    removals,
    async upsertJobScheduler(id, repeat, template) {
      upserts.push({ id, pattern: repeat.pattern, name: template.name });
    },
    async getJobSchedulers() {
      return existingKeys.map((key) => ({ key }));
    },
    async removeJobScheduler(id) {
      removals.push(id);
      return true;
    },
  };
}

describe('reconcileSchedules', () => {
  it('upserts declared schedules and removes undeclared ones', async () => {
    // Arrange
    const queue = fakeQueue(['sync-and-predict', 'old-nightly']);
    const schedules: JobSchedule[] = [
      {
        id: 'sync-and-predict',
        name: 'scrape-source',
        cron: '15 */6 * * *',
        data: { chain: true },
        description: '',
      },
    ];

    // Act
    const result = await reconcileSchedules(queue, schedules);

    // Assert
    expect(result).toEqual({ upserted: ['sync-and-predict'], removed: ['old-nightly'] });
    expect(queue.removals).toEqual(['old-nightly']);
    expect(queue.upserts).toEqual([
      { id: 'sync-and-predict', pattern: '15 */6 * * *', name: 'scrape-source' },
    ]);
  });
});
