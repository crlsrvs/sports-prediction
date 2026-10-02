import { createAppStore, type AppStore } from '@sports-prediction/database';
import {
  asDataSourceId,
  asPredictionId,
  type MatchContext,
} from '@sports-prediction/domain';
import { buildFeatureSnapshot } from '@sports-prediction/features';
import {
  evaluatePrediction,
  predictionEngine,
} from '@sports-prediction/prediction';
import {
  createApiFootballAdapterFromEnv,
  currentFootballSeason,
  ingestApiFootballFixtures,
} from '@sports-prediction/scraping';
import {
  API_FOOTBALL_SOURCE_ID,
  MAX_RAW_RETENTION_DAYS,
  SEED_SOURCE_ID,
} from '@sports-prediction/shared';
import type { JobName } from './queues.js';
import { JOB_NAMES } from './queues.js';

export async function runPipelineJob(
  name: JobName,
): Promise<{ readonly ok: true; readonly detail: string }> {
  const { store } = await createAppStore();

  switch (name) {
    case JOB_NAMES.DISCOVER_TODAYS_MATCHES: {
      const matches = await store.listMatches();
      const todayCount = matches.filter((match) => isSameUtcDay(match.scheduledAt, new Date())).length;
      return { ok: true, detail: `discovered:${todayCount}` };
    }
    case JOB_NAMES.SCRAPE_SOURCE:
      return scrapeSource(store);
    case JOB_NAMES.NORMALIZE_SOURCE_DATA:
      return {
        ok: true,
        detail: 'skipped:normalize-runs-inline-during-scrape',
      };
    case JOB_NAMES.CALCULATE_FEATURES:
      return {
        ok: true,
        detail: 'skipped:features-computed-on-demand',
      };
    case JOB_NAMES.GENERATE_PREDICTIONS:
      return generatePredictions(store);
    case JOB_NAMES.EVALUATE_PREDICTIONS:
      return evaluatePredictions(store);
    case JOB_NAMES.CLEANUP_RAW_DATA: {
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - MAX_RAW_RETENTION_DAYS);
      const deleted = await store.deleteRawRecordsOlderThan(cutoff);
      return { ok: true, detail: `cleanup:${deleted}` };
    }
    case JOB_NAMES.SOURCE_HEALTH_CHECK: {
      const sources = await store.listSources();
      return { ok: true, detail: `checked:${sources.length}` };
    }
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unhandled job: ${String(_exhaustive)}`);
    }
  }
}

async function scrapeSource(
  store: AppStore,
): Promise<{ readonly ok: true; readonly detail: string }> {
  const sources = await store.listSources();
  const apiSource =
    sources.find((item) => String(item.id) === API_FOOTBALL_SOURCE_ID) ?? null;
  const seedSource =
    sources.find((item) => String(item.id) === SEED_SOURCE_ID) ?? sources[0] ?? null;

  const adapter = createApiFootballAdapterFromEnv();
  if (!adapter || !apiSource) {
    const target = apiSource ?? seedSource;
    if (!target) return { ok: true, detail: 'skipped:no-source' };
    await store.addScrapingJob({
      id: `job-${crypto.randomUUID()}`,
      sourceId: target.id,
      startedAt: new Date(),
      finishedAt: new Date(),
      status: 'skipped',
      recordsFound: 0,
      recordsProcessed: 0,
      recordsFailed: 0,
      error: adapter
        ? 'API-Football source missing from store'
        : 'API_FOOTBALL_KEY not configured',
    });
    return {
      ok: true,
      detail: adapter
        ? 'skipped:api-football-source-missing'
        : 'skipped:missing-api-football-key',
    };
  }

  const startedAt = new Date();
  try {
    const today = startedAt.toISOString().slice(0, 10);
    const season = currentFootballSeason(startedAt);
    const { raw, fixtures } = await adapter.fetchTodaysFixtures({
      date: today,
      season,
    });

    for (const scrape of raw) {
      await store.saveRawRecord({
        id: `raw-${crypto.randomUUID()}`,
        sourceId: scrape.sourceId,
        url: scrape.url,
        fetchedAt: scrape.fetchedAt,
        statusCode: scrape.statusCode,
        contentType: scrape.contentType,
        payload: scrape.payload,
        checksum: scrape.checksum,
        metadata: scrape.metadata,
      });
    }

    const [teams, competitions] = await Promise.all([
      store.listTeams(),
      store.listCompetitions(),
    ]);
    const ingested = ingestApiFootballFixtures({
      fixtures,
      teams,
      competitions,
      now: startedAt,
    });

    for (const team of ingested.teamsToUpsert) {
      await store.upsertTeam(team);
    }
    for (const match of ingested.matches) {
      await store.upsertMatch(match);
    }
    for (const name of ingested.unresolvedNames) {
      await store.addUnresolvedEntity({
        id: `unresolved-${crypto.randomUUID()}`,
        incomingName: name,
        sourceId: asDataSourceId(API_FOOTBALL_SOURCE_ID),
        createdAt: startedAt,
      });
    }

    await store.addScrapingJob({
      id: `job-${crypto.randomUUID()}`,
      sourceId: apiSource.id,
      startedAt,
      finishedAt: new Date(),
      status: ingested.failed > 0 ? 'partial' : 'success',
      recordsFound: fixtures.length,
      recordsProcessed: ingested.processed,
      recordsFailed: ingested.failed,
      error: null,
    });

    await store.upsertSource({
      ...apiSource,
      active: true,
      health: 'healthy',
      lastSuccessAt: new Date(),
      consecutiveFailures: 0,
    });

    return {
      ok: true,
      detail: `scraped:${ingested.processed}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.addScrapingJob({
      id: `job-${crypto.randomUUID()}`,
      sourceId: apiSource.id,
      startedAt,
      finishedAt: new Date(),
      status: 'failed',
      recordsFound: 0,
      recordsProcessed: 0,
      recordsFailed: 1,
      error: message,
    });
    await store.upsertSource({
      ...apiSource,
      health: 'broken',
      lastFailureAt: new Date(),
      consecutiveFailures: apiSource.consecutiveFailures + 1,
    });
    return { ok: true, detail: `failed:${message}` };
  }
}

async function generatePredictions(
  store: AppStore,
): Promise<{ readonly ok: true; readonly detail: string }> {
  const matches = await store.listMatches();
  const scheduled = matches.filter((match) => match.status === 'scheduled');
  let generated = 0;
  for (const match of scheduled) {
    const existing = await store.getLatestPrediction(match.id);
    if (existing) continue;

    const homeTeam = await store.getTeam(match.homeTeamId);
    const awayTeam = await store.getTeam(match.awayTeamId);
    const competition = (await store.listCompetitions()).find(
      (item) => item.id === match.competitionId,
    );
    if (!homeTeam || !awayTeam || !competition) continue;

    const dataCutoffAt = new Date(match.scheduledAt.getTime() - 5 * 60 * 1000);
    const history = matches
      .filter(
        (item) =>
          item.status === 'finished' &&
          item.homeScore !== null &&
          item.awayScore !== null,
      )
      .map((item) => ({
        match: item,
        homeScore: item.homeScore as number,
        awayScore: item.awayScore as number,
      }));

    const featureSnapshot = buildFeatureSnapshot({
      matchId: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      matchScheduledAt: match.scheduledAt,
      dataCutoffAt,
      history,
    });

    const context: MatchContext = {
      match,
      competition,
      homeTeam,
      awayTeam,
      featureSnapshot,
      dataCutoffAt,
    };

    const result = predictionEngine.predict(context, featureSnapshot);
    if (!result.ok) continue;

    await store.savePrediction({
      id: asPredictionId(`pred-${match.id}-${Date.now()}`),
      matchId: match.id,
      generatedAt: new Date(),
      dataCutoffAt,
      modelVersion: result.value.modelVersion,
      predictedScore: result.value.predictedScore,
      expectedGoals: result.value.expectedGoals,
      confidence: result.value.confidence,
      factors: result.value.factors,
    });
    generated += 1;
  }
  return { ok: true, detail: `generated:${generated}` };
}

async function evaluatePredictions(
  store: AppStore,
): Promise<{ readonly ok: true; readonly detail: string }> {
  const matches = await store.listMatches();
  const finished = matches.filter(
    (match) =>
      match.status === 'finished' &&
      match.homeScore !== null &&
      match.awayScore !== null,
  );

  let evaluated = 0;
  for (const match of finished) {
    const prediction = await store.getLatestPrediction(match.id);
    if (!prediction) continue;
    evaluatePrediction(
      prediction.predictedScore,
      match.homeScore as number,
      match.awayScore as number,
    );
    evaluated += 1;
  }
  return { ok: true, detail: `evaluated:${evaluated}` };
}

function isSameUtcDay(date: Date, now: Date): boolean {
  return (
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate()
  );
}
