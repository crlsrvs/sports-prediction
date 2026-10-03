import { Global, Logger, Module } from '@nestjs/common';
import { createAppStore, type CreateStoreResult } from '@sports-prediction/database';
import { STORE, STORE_INFO, type StoreInfo } from './store.tokens.js';

const STORE_RESULT = Symbol('STORE_RESULT');

@Global()
@Module({
  providers: [
    {
      provide: STORE_RESULT,
      useFactory: async (): Promise<CreateStoreResult> => {
        // Throws StoreConnectionError when DATABASE_URL is set but unreachable,
        // so the API refuses to start instead of silently serving demo data.
        const result = await createAppStore();
        Logger.log(`App store mode: ${result.mode}`, 'StoreModule');
        if (result.reason) Logger.warn(result.reason, 'StoreModule');
        return result;
      },
    },
    {
      provide: STORE,
      useFactory: (result: CreateStoreResult) => result.store,
      inject: [STORE_RESULT],
    },
    {
      provide: STORE_INFO,
      useFactory: (result: CreateStoreResult): StoreInfo => ({
        mode: result.mode,
        reason: result.reason,
      }),
      inject: [STORE_RESULT],
    },
  ],
  exports: [STORE, STORE_INFO],
})
export class StoreModule {}
