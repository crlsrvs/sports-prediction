export const JOB_NAMES = {
  DISCOVER_TODAYS_MATCHES: 'discover-todays-matches',
  SCRAPE_SOURCE: 'scrape-source',
  IMPORT_SEASON: 'import-season',
  NORMALIZE_SOURCE_DATA: 'normalize-source-data',
  CALCULATE_FEATURES: 'calculate-features',
  GENERATE_PREDICTIONS: 'generate-predictions',
  EVALUATE_PREDICTIONS: 'evaluate-predictions',
  CLEANUP_RAW_DATA: 'cleanup-raw-data',
  SOURCE_HEALTH_CHECK: 'source-health-check',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export const DEFAULT_QUEUE_NAME = 'sports-prediction';

export const API_FOOTBALL_SOURCE_ID = 'source-api-football';
export const FOOTBALL_DATA_SOURCE_ID = 'source-football-data';
export const SEED_SOURCE_ID = 'source-seed';

/** Anything that is not the fabricated demo seed counts as real provider data. */
export function isLiveSourceId(sourceId: string): boolean {
  return sourceId !== SEED_SOURCE_ID;
}

export function isJobName(value: string): value is JobName {
  return (Object.values(JOB_NAMES) as string[]).includes(value);
}
