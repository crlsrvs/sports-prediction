import { Controller, Get, Inject } from '@nestjs/common';
import type { AppStore, DataMode } from '@sports-prediction/database';
import type { Competition, Sport, Team } from '@sports-prediction/domain';
import { STORE } from '../store/store.tokens.js';

@Controller()
export class SportsController {
  constructor(@Inject(STORE) private readonly store: AppStore) {}

  @Get('sports')
  listSports(): Promise<readonly Sport[]> {
    return this.store.listSports();
  }

  /** Public catalogue: only featured (active) competitions. */
  @Get('competitions')
  async listCompetitions(): Promise<readonly Competition[]> {
    const competitions = await this.store.listCompetitions();
    return competitions.filter((item) => item.active);
  }

  @Get('teams')
  listTeams(): Promise<readonly Team[]> {
    return this.store.listTeams();
  }

  @Get('meta')
  async meta(): Promise<{ readonly dataMode: DataMode }> {
    return { dataMode: await this.store.getDataMode() };
  }
}
