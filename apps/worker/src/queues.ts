export const JOB_NAMES = {
  DISCOVER_TODAYS_MATCHES: 'discover-todays-matches',
  SCRAPE_SOURCE: 'scrape-source',
  NORMALIZE_SOURCE_DATA: 'normalize-source-data',
  CALCULATE_FEATURES: 'calculate-features',
  GENERATE_PREDICTIONS: 'generate-predictions',
  EVALUATE_PREDICTIONS: 'evaluate-predictions',
  CLEANUP_RAW_DATA: 'cleanup-raw-data',
  SOURCE_HEALTH_CHECK: 'source-health-check',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export const DEFAULT_QUEUE_NAME = 'sports-prediction';
