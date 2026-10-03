import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type {
  AppStore,
  DataSourceRecord,
  ResolveEntityResult,
  TeamMergeResult,
} from '@sports-prediction/database';
import {
  asCompetitionId,
  asDataSourceId,
  asSportId,
  type Competition,
  type Prediction,
  type Sport,
  type Team,
} from '@sports-prediction/domain';
import { DEFAULT_MODEL_VERSION } from '@sports-prediction/prediction';
import {
  createApiFootballAdapterFromEnv,
  createFootballDataAdapterFromEnv,
} from '@sports-prediction/scraping';
import {
  API_FOOTBALL_SOURCE_ID,
  FOOTBALL_DATA_SOURCE_ID,
  isJobName,
  JOB_NAMES,
  SEED_SOURCE_ID,
  type JobName,
} from '@sports-prediction/shared';
import { AnalysisService } from '../analysis/analysis.service.js';
import { enqueueJob } from '../jobs/jobQueue.js';
import { STORE } from '../store/store.tokens.js';

interface PingableAdapter {
  readonly name: string;
  ping(): Promise<{ readonly ok: boolean; readonly results: number }>;
}

interface PingableProvider {
  readonly slug: string;
  readonly envKey: string;
  readonly create: () => PingableAdapter | null;
}

/** External sources the admin "test" button can reach, keyed by source id. */
const PINGABLE_PROVIDERS: Readonly<Record<string, PingableProvider>> = {
  [API_FOOTBALL_SOURCE_ID]: {
    slug: 'api-football',
    envKey: 'API_FOOTBALL_KEY',
    create: () => createApiFootballAdapterFromEnv(),
  },
  [FOOTBALL_DATA_SOURCE_ID]: {
    slug: 'football-data',
    envKey: 'FOOTBALL_DATA_KEY',
    create: () => createFootballDataAdapterFromEnv(),
  },
};

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
  async testSource(
    @Param('id') id: string,
  ): Promise<{
    readonly source: DataSourceRecord;
    readonly detail: string;
  }> {
    const sources = await this.store.listSources();
    const current = sources.find((item) => item.id === id);
    if (!current) throw new NotFoundException('Fuente no encontrada');

    const now = new Date();

    if (String(current.id) === SEED_SOURCE_ID) {
      const matches = await this.store.listMatches();
      const seeded = matches.filter(
        (match) => String(match.sourceId) === SEED_SOURCE_ID,
      );
      await this.store.addScrapingJob({
        id: `job-${crypto.randomUUID()}`,
        sourceId: current.id,
        startedAt: now,
        finishedAt: now,
        status: 'success',
        recordsFound: seeded.length,
        recordsProcessed: seeded.length,
        recordsFailed: 0,
        error: null,
      });
      const source = await this.store.upsertSource({
        ...current,
        health: 'healthy',
        lastSuccessAt: now,
        consecutiveFailures: 0,
      });
      return {
        source,
        detail: `seed-ok:${seeded.length}`,
      };
    }

    const provider = PINGABLE_PROVIDERS[String(current.id)];
    if (provider) {
      const adapter = provider.create();
      if (!adapter) {
        await this.store.addScrapingJob({
          id: `job-${crypto.randomUUID()}`,
          sourceId: current.id,
          startedAt: now,
          finishedAt: now,
          status: 'skipped',
          recordsFound: 0,
          recordsProcessed: 0,
          recordsFailed: 0,
          error: `${provider.envKey} not configured`,
        });
        const source = await this.store.upsertSource({
          ...current,
          active: false,
          health: 'disabled',
        });
        return {
          source,
          detail: `skipped:missing-${provider.slug}-key`,
        };
      }

      try {
        const ping = await adapter.ping();
        if (!ping.ok) {
          throw new Error(`${adapter.name} ping failed`);
        }
        await this.store.addScrapingJob({
          id: `job-${crypto.randomUUID()}`,
          sourceId: current.id,
          startedAt: now,
          finishedAt: now,
          status: 'success',
          recordsFound: ping.results,
          recordsProcessed: ping.results,
          recordsFailed: 0,
          error: null,
        });
        const source = await this.store.upsertSource({
          ...current,
          active: true,
          health: 'healthy',
          lastSuccessAt: now,
          consecutiveFailures: 0,
        });
        return {
          source,
          detail: `${provider.slug}-ok:${ping.results}`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.store.addScrapingJob({
          id: `job-${crypto.randomUUID()}`,
          sourceId: current.id,
          startedAt: now,
          finishedAt: now,
          status: 'failed',
          recordsFound: 0,
          recordsProcessed: 0,
          recordsFailed: 1,
          error: message,
        });
        const source = await this.store.upsertSource({
          ...current,
          health: 'broken',
          lastFailureAt: now,
          consecutiveFailures: current.consecutiveFailures + 1,
        });
        return {
          source,
          detail: `${provider.slug}-failed:${message}`,
        };
      }
    }

    await this.store.addScrapingJob({
      id: `job-${crypto.randomUUID()}`,
      sourceId: current.id,
      startedAt: now,
      finishedAt: now,
      status: 'skipped',
      recordsFound: 0,
      recordsProcessed: 0,
      recordsFailed: 0,
      error: 'No adapter wired for this source',
    });
    return {
      source: current,
      detail: 'skipped:unsupported-source',
    };
  }

  @Get('scraping/jobs')
  listJobs() {
    return this.store.listScrapingJobs();
  }

  @Post('jobs')
  async enqueue(
    @Body() body: { readonly name?: string; readonly season?: number | string },
  ): Promise<{ readonly jobId: string; readonly name: JobName }> {
    if (!body.name || !isJobName(body.name)) {
      throw new BadRequestException(
        `Job inválido. Permitidos: ${Object.values(JOB_NAMES).join(', ')}`,
      );
    }
    const data: Record<string, unknown> = {};
    if (body.season !== undefined && body.season !== '') {
      const season = Number(body.season);
      if (!Number.isInteger(season) || season < 2000 || season > 2100) {
        throw new BadRequestException('Temporada inválida (ej. 2023)');
      }
      data['season'] = season;
    }
    try {
      return await enqueueJob(body.name, data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `No se pudo encolar el job (¿Redis activo?): ${message}`,
      );
    }
  }

  @Get('entities/unresolved')
  listUnresolved() {
    return this.store.listUnresolvedEntities();
  }

  @Get('teams')
  listTeams(): Promise<readonly Team[]> {
    return this.store.listTeams();
  }

  /**
   * Resolves a pending entity. When the ingest created a provisional team for
   * it, that team is merged into `teamId` so its matches follow.
   */
  @Post('entities/match')
  async matchEntity(
    @Body()
    body: {
      readonly unresolvedId: string;
      readonly teamId: string;
      readonly alias: string;
    },
  ): Promise<ResolveEntityResult> {
    if (!body?.unresolvedId || !body.teamId || !body.alias) {
      throw new BadRequestException('unresolvedId, teamId y alias son obligatorios');
    }
    const result = await this.store.resolveEntity(body);
    if (!result) throw new NotFoundException('No se pudo resolver la entidad');
    return result;
  }

  /** Merges `sourceTeamId` into `targetTeamId`: matches and aliases move, source is deleted. */
  @Post('teams/merge')
  async mergeTeams(
    @Body()
    body: { readonly sourceTeamId: string; readonly targetTeamId: string },
  ): Promise<TeamMergeResult> {
    if (!body?.sourceTeamId || !body.targetTeamId) {
      throw new BadRequestException('sourceTeamId y targetTeamId son obligatorios');
    }
    if (body.sourceTeamId === body.targetTeamId) {
      throw new BadRequestException('Origen y destino deben ser equipos distintos');
    }
    const result = await this.store.mergeTeams(body);
    if (!result) throw new NotFoundException('Equipo origen o destino no encontrado');
    return result;
  }

  @Get('predictions')
  listPredictions(): Promise<readonly Prediction[]> {
    return this.store.listPredictions();
  }

  /** Lists persisted backtest runs (most recent first). Read-only. */
  @Get('backtests')
  listBacktests(@Query('limit') limit?: string) {
    const parsed = Number(limit);
    return this.analysisService.listBacktestRuns(
      Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : 20,
    );
  }

  /** Runs a walk-forward backtest for `model` and persists the result. */
  @Post('backtests')
  runBacktest(@Body() body: { readonly model?: string } = {}) {
    return this.analysisService.runBacktest(body?.model || undefined);
  }

  @Get('models')
  listModels(): { readonly default: string; readonly available: readonly string[] } {
    return {
      default: DEFAULT_MODEL_VERSION,
      available: this.analysisService.listModels(),
    };
  }

  @Post('predictions/generate')
  async generatePredictions() {
    const count = await this.analysisService.generateAllPredictions();
    return { generated: count };
  }

  @Post('predictions/regenerate')
  regeneratePredictions(@Body() body: { readonly force?: boolean } = {}) {
    return this.analysisService.regenerateOutdatedPredictions({
      force: body?.force === true,
    });
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
    const [sources, jobs, unresolved, predictions, dataMode] = await Promise.all([
      this.store.listSources(),
      this.store.listScrapingJobs(),
      this.store.listUnresolvedEntities(),
      this.store.listPredictions(),
      this.store.getDataMode(),
    ]);
    return {
      sources: sources.length,
      healthySources: sources.filter((item) => item.health === 'healthy').length,
      jobs: jobs.length,
      unresolvedEntities: unresolved.length,
      predictions: predictions.length,
      dataMode,
    };
  }

  @Get('meta')
  async meta() {
    return {
      dataMode: await this.store.getDataMode(),
    };
  }
}
