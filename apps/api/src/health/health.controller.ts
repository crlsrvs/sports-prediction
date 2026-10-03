import { Controller, Get, Inject } from '@nestjs/common';
import { STORE_INFO, type StoreInfo } from '../store/store.tokens.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(STORE_INFO) private readonly storeInfo: StoreInfo) {}

  @Get()
  getHealth(): {
    readonly status: 'ok';
    readonly store: StoreInfo['mode'];
    readonly storeReason: string | null;
  } {
    return {
      status: 'ok',
      store: this.storeInfo.mode,
      storeReason: this.storeInfo.reason,
    };
  }
}
