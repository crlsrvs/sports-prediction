import { Controller, Get, Inject } from '@nestjs/common';
import type { AppStore } from '@sports-prediction/database';
import type { Competition, Sport } from '@sports-prediction/domain';
import { STORE } from '../store/store.tokens.js';

@Controller()
export class SportsController {
  constructor(@Inject(STORE) private readonly store: AppStore) {}

  @Get('sports')
  listSports(): Promise<readonly Sport[]> {
    return this.store.listSports();
  }

  @Get('competitions')
  listCompetitions(): Promise<readonly Competition[]> {
    return this.store.listCompetitions();
  }
}
