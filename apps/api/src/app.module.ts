import { Module } from '@nestjs/common';
import { AdminController } from './admin/admin.controller.js';
import { AnalysisService } from './analysis/analysis.service.js';
import { HealthController } from './health/health.controller.js';
import { MatchesController } from './matches/matches.controller.js';
import { SportsController } from './sports/sports.controller.js';
import { StoreModule } from './store/store.module.js';

@Module({
  imports: [StoreModule],
  controllers: [
    HealthController,
    MatchesController,
    SportsController,
    AdminController,
  ],
  providers: [AnalysisService],
})
export class AppModule {}
