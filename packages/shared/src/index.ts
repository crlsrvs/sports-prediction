export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export const MAX_RAW_RETENTION_DAYS = 30;
export const MIN_RAW_RETENTION_DAYS = 7;

/**
 * Only fixtures kicking off within this many days get predictions generated
 * in batch. A full season of scheduled fixtures is known months ahead, but a
 * prediction made that early would be stale by kickoff.
 */
export const PREDICTION_HORIZON_DAYS = 10;

export function isWithinPredictionHorizon(
  scheduledAt: Date,
  now: Date = new Date(),
): boolean {
  const horizonEnd = now.getTime() + PREDICTION_HORIZON_DAYS * 24 * 60 * 60 * 1000;
  return scheduledAt.getTime() <= horizonEnd;
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

export { dixonColesTau } from './dixonColesTau.js';
export {
  API_FOOTBALL_SOURCE_ID,
  FOOTBALL_DATA_SOURCE_ID,
  isLiveSourceId,
  DEFAULT_QUEUE_NAME,
  isJobName,
  JOB_NAMES,
  SEED_SOURCE_ID,
  type JobName,
} from './jobs.js';

