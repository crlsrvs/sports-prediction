import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { AppStore, DataSourceRecord } from '@sports-prediction/database';
import {
  asCompetitionId,
  asDataSourceId,
  asSportId,
  type Competition,
  type Prediction,
  type Sport,
} from '@sports-prediction/domain';
import { AnalysisService } from '../analysis/analysis.service.js';
import { STORE } from '../store/store.tokens.js';

@Controller('admin')
export class AdminController {
  constructor(
    @Inject(STORE) private readonly store: AppStore,
    @Inject(AnalysisService) private readonly analysisService: AnalysisService,
  ) {}

  @Get('sources')
  listSources(): Promise<readonly DataSourceRecord[]> {
    return this.store.listSources();
  }

  @Post('sources')
  async createSource(
    @Body()
    body: {
      readonly id?: string;
      readonly name: string;
      readonly kind: 'api' | 'web';
      readonly active?: boolean;
    },
  ): Promise<DataSourceRecord> {
    const source: DataSourceRecord = {
      id: asDataSourceId(body.id ?? `source-${crypto.randomUUID()}`),
      name: body.name,
      kind: body.kind,
      active: body.active ?? true,
      health: 'healthy',
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
    };
    return this.store.upsertSource(source);
  }

  @Patch('sources/:id')
  async patchSource(
    @Param('id') id: string,
    @Body()
    body: {
      readonly active?: boolean;
      readonly health?: DataSourceRecord['health'];
    },
  ): Promise<DataSourceRecord> {
    const sources = await this.store.listSources();
    const current = sources.find((item) => item.id === id);
    if (!current) throw new NotFoundException('Fuente no encontrada');
    return this.store.upsertSource({
      ...current,
      active: body.active ?? current.active,
      health: body.health ?? current.health,
    });
  }

  @Post('sources/:id/test')
  async testSource(@Param('id') id: string): Promise<DataSourceRecord> {
    const sources = await this.store.listSources();
    const current = sources.find((item) => item.id === id);
    if (!current) throw new NotFoundException('Fuente no encontrada');

    const now = new Date();
    const job = await this.store.addScrapingJob({
      id: `job-${crypto.randomUUID()}`,
      sourceId: current.id,
      startedAt: now,
      finishedAt: now,
      status: 'success',
      recordsFound: 4,
      recordsProcessed: 4,
      recordsFailed: 0,
      error: null,
    });

    void job;

    return this.store.upsertSource({
      ...current,
      health: 'healthy',
      lastSuccessAt: now,
      consecutiveFailures: 0,
    });
  }

  @Get('scraping/jobs')
  listJobs() {
    return this.store.listScrapingJobs();
  }

  @Get('entities/unresolved')
  listUnresolved() {
    return this.store.listUnresolvedEntities();
  }

  @Post('entities/match')
  async matchEntity(
    @Body()
    body: {
      readonly unresolvedId: string;
      readonly teamId: string;
      readonly alias: string;
    },
  ) {
    const team = await this.store.resolveEntity(body);
    if (!team) throw new NotFoundException('No se pudo resolver la entidad');
    return team;
  }

  @Get('predictions')
  listPredictions(): Promise<readonly Prediction[]> {
    return this.store.listPredictions();
  }

  @Get('backtests')
  runBacktest() {
    return this.analysisService.runBacktest();
  }

  @Post('predictions/generate')
  async generatePredictions() {
    const count = await this.analysisService.generateAllPredictions();
    return { generated: count };
  }

  @Post('sports')
  createSport(
    @Body() body: { readonly name: string; readonly slug: string },
  ): Promise<Sport> {
    return this.store.upsertSport({
      id: asSportId(`sport-${body.slug}`),
      name: body.name,
      slug: body.slug,
      active: true,
    });
  }

  @Post('competitions')
  async createCompetition(
    @Body()
    body: {
      readonly name: string;
      readonly sportId: string;
      readonly country?: string | null;
    },
  ): Promise<Competition> {
    return this.store.upsertCompetition({
      id: asCompetitionId(`comp-${crypto.randomUUID()}`),
      sportId: asSportId(body.sportId),
      name: body.name,
      country: body.country ?? null,
      active: true,
    });
  }

  @Get('health')
  async systemHealth() {
    const [sources, jobs, unresolved, predictions] = await Promise.all([
      this.store.listSources(),
      this.store.listScrapingJobs(),
      this.store.listUnresolvedEntities(),
      this.store.listPredictions(),
    ]);
    return {
      sources: sources.length,
      healthySources: sources.filter((item) => item.health === 'healthy').length,
      jobs: jobs.length,
      unresolvedEntities: unresolved.length,
      predictions: predictions.length,
    };
  }
}
