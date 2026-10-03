import { JOB_NAMES, type JobName } from './jobs.js';

export interface JobSchedule {
  /** Stable BullMQ scheduler id; changing it re-creates the schedule. */
  readonly id: string;
  readonly name: JobName;
  /** 5-field cron expression, evaluated in UTC. */
  readonly cron: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly description: string;
}

/**
 * Recurring background work. `scrape-source` runs with `chain: true` so the
 * worker generates and evaluates predictions right after syncing instead of
 * relying on cron offsets. football-data.org allows 10 req/min; one sync is 6.
 */
export const JOB_SCHEDULES: readonly JobSchedule[] = [
  {
    id: 'sync-and-predict',
    name: JOB_NAMES.SCRAPE_SOURCE,
    cron: '15 */6 * * *',
    data: { chain: true },
    description:
      'Sincroniza la temporada en curso y, si va bien, genera y evalúa predicciones',
  },
  {
    id: 'cleanup-raw-weekly',
    name: JOB_NAMES.CLEANUP_RAW_DATA,
    cron: '0 5 * * 1',
    data: {},
    description: 'Borra payloads RAW con más de 30 días',
  },
];

/** `JOB_SCHEDULER_ENABLED=false` lets a developer run the worker without cron. */
export function isJobSchedulerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env['JOB_SCHEDULER_ENABLED']?.trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'no');
}
