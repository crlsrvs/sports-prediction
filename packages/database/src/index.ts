export { createPool, type DbPool } from './client.js';
export { loadDatabaseConfig, type DatabaseConfig } from './config.js';
export {
  createAppStore,
  StoreConnectionError,
  type CreateStoreDeps,
  type CreateStoreResult,
  type StoreMode,
} from './createStore.js';
export { MemoryStore } from './store/memoryStore.js';
export { PostgresStore } from './store/postgresStore.js';
export { createSeedData } from './store/seed.js';
export type {
  AppStore,
  BacktestBaselineMetrics,
  BacktestCalibrationBucket,
  BacktestCompetitionMetrics,
  BacktestRunRecord,
  DataMode,
  DataSourceRecord,
  EntityAliasRecord,
  RawRecord,
  ScrapingJobRecord,
  SourceHealth,
  UnresolvedEntity,
} from './store/types.js';

