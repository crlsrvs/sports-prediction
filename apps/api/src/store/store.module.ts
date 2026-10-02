import { Global, Module } from '@nestjs/common';
import { createAppStore, type AppStore } from '@sports-prediction/database';
import { STORE } from './store.tokens.js';

@Global()
@Module({
  providers: [
    {
      provide: STORE,
      useFactory: async (): Promise<AppStore> => {
        const result = await createAppStore();
        console.log(`App store mode: ${result.mode}`);
        return result.store;
      },
    },
  ],
  exports: [STORE],
})
export class StoreModule {}
