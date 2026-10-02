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

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

export {
  API_FOOTBALL_SOURCE_ID,
  DEFAULT_QUEUE_NAME,
  isJobName,
  JOB_NAMES,
  SEED_SOURCE_ID,
  type JobName,
} from './jobs.js';

