import { Controller, Get, Inject, Param } from '@nestjs/common';
import { type MatchAnalysis, type MatchCard } from '@sports-prediction/domain';
import { AnalysisService } from '../analysis/analysis.service.js';

@Controller('matches')
export class MatchesController {
  constructor(
    @Inject(AnalysisService)
    private readonly analysisService: AnalysisService,
  ) {}

  @Get('today')
  getToday(): Promise<readonly MatchCard[]> {
    return this.analysisService.listTodayCards();
  }

  @Get(':id')
  getMatch(@Param('id') id: string): Promise<MatchCard> {
    return this.analysisService.getMatchCard(id);
  }

  @Get(':id/analysis')
  getAnalysis(@Param('id') id: string): Promise<MatchAnalysis> {
    return this.analysisService.getAnalysis(id);
  }
}
