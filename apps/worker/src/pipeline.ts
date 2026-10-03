import {
  createAppStore,
  type AppStore,
  type DataSourceRecord,
} from '@sports-prediction/database';
import {
  asPredictionId,
  type DataSourceId,
  type MatchContext,
} from '@sports-prediction/domain';
import {
  buildFeatureSnapshot,
  buildFinishedHistory,
  fitDixonColes,
} from '@sports-prediction/features';
import {
  evaluatePrediction,
  predictionEngine,
} from '@sports-prediction/prediction';
import {
  createApiFootballAdapterFromEnv,
  createFootballDataAdapterFromEnv,
  ingestApiFootballFixtures,
  ingestFootballDataMatches,
  resolveApiFootballSeason,
  trackedCompetitions,
  type FootballDataAdapter,
  type IngestFixturesResult,
} from '@sports-prediction/scraping';

import {
  API_FOOTBALL_SOURCE_ID,
  isWithinPredictionHorizon,
  MAX_RAW_RETENTION_DAYS,
  SEED_SOURCE_ID,
} from '@sports-prediction/shared';
import type { JobName } from './queues.js';
import { JOB_NAMES } from './queues.js';

export async function runPipelineJob(
  name: JobName,
  data: Record<string, unknown> = {},
): Promise<{ readonly ok: true; readonly detail: string }> {
  const { store } = await createAppStore();

  switch (name) {
    case JOB_NAMES.DISCOVER_TODAYS_MATCHES: {
      const matches = await store.listMatches();
      const todayCount = matches.filter((match) => isSameUtcDay(match.scheduledAt, new Date())).length;
      return { ok: true, detail: `discovered:${todayCount}` };
    }
    case JOB_NAMES.SCRAPE_SOURCE: {
      const scraped = await scrapeSources(store);
      if (data['chain'] !== true) return scraped;
      // Scheduled runs chain the follow-ups so fresh results immediately feed
      // new predictions and evaluations without cron offsets.
      const generated = await generatePredictions(store);
      const evaluated = await evaluatePredictions(store);
      return {
        ok: true,
        detail: `${scraped.detail} ; ${generated.detail} ; ${evaluated.detail}`,
      };
    }
    case JOB_NAMES.IMPORT_SEASON:
      return importSeason(store, parseSeason(data['season']));
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

/**
 * Runs every configured provider. football-data.org syncs the season in
 * progress (fixtures + results); API-Football adds today's fixtures when a key
 * is present. Each provider records its own scraping job.
 */
async function scrapeSources(
  store: AppStore,
): Promise<{ readonly ok: true; readonly detail: string }> {
  const details: string[] = [];
  const footballData = createFootballDataAdapterFromEnv();
  if (footballData) {
    const result = await syncFootballData(store, footballData);
    details.push(`football-data:${result.detail}`);
  }
  const apiFootball = await scrapeApiFootball(store);
  details.push(`api-football:${apiFootball.detail}`);
  return { ok: true, detail: details.join(' ; ') };
}

async function ensureTrackedCompetitions(store: AppStore): Promise<void> {
  // Support leagues are created inactive; admin-managed flags on existing
  // competitions are never overridden.
  const existing = await store.listCompetitions();
  const existingIds = new Set(existing.map((item) => String(item.id)));
  for (const competition of trackedCompetitions()) {
    if (!existingIds.has(String(competition.id))) {
      await store.upsertCompetition(competition);
    }
  }
}

async function ensureSource(
  store: AppStore,
  adapter: { readonly id: DataSourceId; readonly name: string },
): Promise<DataSourceRecord> {
  const sources = await store.listSources();
  const found = sources.find((item) => String(item.id) === String(adapter.id));
  if (found) return found;
  return store.upsertSource({
    id: adapter.id,
    name: adapter.name,
    kind: 'api',
    active: true,
    health: 'warning',
    lastSuccessAt: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
  });
}

async function persistIngest(
  store: AppStore,
  ingested: IngestFixturesResult,
  sourceId: DataSourceId,
  now: Date,
): Promise<void> {
  for (const team of ingested.teamsToUpsert) {
    await store.upsertTeam(team);
  }
  for (const match of ingested.matches) {
    await store.upsertMatch(match);
  }
  const pending = await store.listUnresolvedEntities();
  const pendingNames = new Set(pending.map((item) => item.incomingName));
  for (const unresolved of ingested.unresolvedTeams) {
    if (pendingNames.has(unresolved.name)) continue;
    await store.addUnresolvedEntity({
      id: `unresolved-${crypto.randomUUID()}`,
      incomingName: unresolved.name,
      sourceId,
      createdAt: now,
      provisionalTeamId: unresolved.teamId,
    });
  }
}

async function syncFootballData(
  store: AppStore,
  adapter: FootballDataAdapter,
): Promise<{ readonly detail: string }> {
  const source = await ensureSource(store, adapter);
  const startedAt = new Date();
  try {
    await ensureTrackedCompetitions(store);
    const { raw, matches, warnings } = await adapter.fetchTrackedCompetitions();

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

    const [teams, competitions, existingMatches] = await Promise.all([
      store.listTeams(),
      store.listCompetitions(),
      store.listMatches(),
    ]);
    const ingested = ingestFootballDataMatches({
      matches,
      teams,
      competitions,
      existingMatches,
      now: startedAt,
    });
    await persistIngest(store, ingested, source.id, startedAt);

    const warningText = warnings.length > 0 ? warnings.join(' | ') : null;
    await store.addScrapingJob({
      id: `job-${crypto.randomUUID()}`,
      sourceId: source.id,
      startedAt,
      finishedAt: new Date(),
      status:
        ingested.processed === 0 || ingested.failed > 0 || warnings.length > 0
          ? 'partial'
          : 'success',
      recordsFound: matches.length,
      recordsProcessed: ingested.processed,
      recordsFailed: ingested.failed,
      error: warningText,
    });
    await store.upsertSource({
      ...source,
      active: true,
      health: warnings.length > 0 ? 'warning' : 'healthy',
      lastSuccessAt: new Date(),
      consecutiveFailures: 0,
    });
    return {
      detail: `synced:${ingested.processed}${
        ingested.deduplicated > 0 ? `:dedup:${ingested.deduplicated}` : ''
      }${warningText ? `:warnings:${warnings.length}` : ''}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.addScrapingJob({
      id: `job-${crypto.randomUUID()}`,
      sourceId: source.id,
      startedAt,
      finishedAt: new Date(),
      status: 'failed',
      recordsFound: 0,
      recordsProcessed: 0,
      recordsFailed: 1,
      error: message,
    });
    await store.upsertSource({
      ...source,
      health: 'broken',
      lastFailureAt: new Date(),
      consecutiveFailures: source.consecutiveFailures + 1,
    });
    return { detail: `failed:${message}` };
  }
}

async function scrapeApiFootball(
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
    const season = resolveApiFootballSeason(startedAt);
    const { raw, fixtures, warnings } = await adapter.fetchTodaysFixtures({
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

    const [teams, competitions, existingMatches] = await Promise.all([
      store.listTeams(),
      store.listCompetitions(),
      store.listMatches(),
    ]);
    const ingested = ingestApiFootballFixtures({
      fixtures,
      teams,
      competitions,
      existingMatches,
      now: startedAt,
    });
    await persistIngest(store, ingested, apiSource.id, startedAt);

    const warningText = warnings.length > 0 ? warnings.join(' | ') : null;
    await store.addScrapingJob({
      id: `job-${crypto.randomUUID()}`,
      sourceId: apiSource.id,
      startedAt,
      finishedAt: new Date(),
      status:
        ingested.processed === 0 || ingested.failed > 0 ? 'partial' : 'success',
      recordsFound: fixtures.length,
      recordsProcessed: ingested.processed,
      recordsFailed: ingested.failed,
      error: warningText,
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
      detail:
        ingested.processed > 0
          ? `scraped:${ingested.processed}`
          : `scraped:0:${warningText ?? 'no-mvp-fixtures'}`,
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

/**
 * Imports full-season real fixtures (PL/UCL/La Liga) for the configured season.
 * Free API-Football plans allow seasons 2022–2024, so this is the primary path
 * to real historical data; results are persisted as finished matches.
 */
async function importSeason(
  store: AppStore,
  requestedSeason: number | null,
): Promise<{ readonly ok: true; readonly detail: string }> {
  const sources = await store.listSources();
  const apiSource =
    sources.find((item) => String(item.id) === API_FOOTBALL_SOURCE_ID) ?? null;
  const adapter = createApiFootballAdapterFromEnv();
  if (!adapter || !apiSource) {
    return {
      ok: true,
      detail: adapter
        ? 'skipped:api-football-source-missing'
        : 'skipped:missing-api-football-key',
    };
  }

  const startedAt = new Date();
  const season = requestedSeason ?? resolveApiFootballSeason(startedAt);
  try {
    await ensureTrackedCompetitions(store);
    const { raw, fixtures, warnings } = await adapter.fetchMvpSeason(season);

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
        metadata: { ...scrape.metadata, season: String(season) },
      });
    }

    const [teams, competitions, existingMatches] = await Promise.all([
      store.listTeams(),
      store.listCompetitions(),
      store.listMatches(),
    ]);
    const ingested = ingestApiFootballFixtures({
      fixtures,
      teams,
      competitions,
      existingMatches,
      now: startedAt,
    });
    // Historical imports create many legitimate provider teams; they are not
    // queued as unresolved to keep the admin list meaningful.
    for (const team of ingested.teamsToUpsert) {
      await store.upsertTeam(team);
    }
    for (const match of ingested.matches) {
      await store.upsertMatch(match);
    }

    const warningText = warnings.length > 0 ? warnings.join(' | ') : null;
    await store.addScrapingJob({
      id: `job-${crypto.randomUUID()}`,
      sourceId: apiSource.id,
      startedAt,
      finishedAt: new Date(),
      status:
        ingested.processed === 0 || ingested.failed > 0 || warnings.length > 0
          ? 'partial'
          : 'success',
      recordsFound: fixtures.length,
      recordsProcessed: ingested.processed,
      recordsFailed: ingested.failed,
      error: warningText,
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
      detail: `imported-season:${season}:${ingested.processed}`,
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
    return { ok: true, detail: `failed:${message}` };
  }
}

async function generatePredictions(
  store: AppStore,
): Promise<{ readonly ok: true; readonly detail: string }> {
  const matches = await store.listMatches();
  const now = new Date();
  const scheduled = matches.filter(
    (match) =>
      match.status === 'scheduled' &&
      isWithinPredictionHorizon(match.scheduledAt, now),
  );
  const competitions = await store.listCompetitions();
  const history = buildFinishedHistory(matches);
  // Every upcoming fixture shares the same cutoff (now), so one fit serves all.
  const ratingsNow = fitDixonColes({ history, cutoffAt: now });

  let generated = 0;
  for (const match of scheduled) {
    const existing = await store.getLatestPrediction(match.id);
    if (existing) continue;

    const homeTeam = await store.getTeam(match.homeTeamId);
    const awayTeam = await store.getTeam(match.awayTeamId);
    const competition = competitions.find(
      (item) => item.id === match.competitionId,
    );
    if (!homeTeam || !awayTeam || !competition) continue;

    const dataCutoffAt = new Date(
      Math.min(now.getTime(), match.scheduledAt.getTime() - 5 * 60 * 1000),
    );
    const ratings =
      dataCutoffAt.getTime() === now.getTime()
        ? ratingsNow
        : fitDixonColes({ history, cutoffAt: dataCutoffAt });

    const featureSnapshot = buildFeatureSnapshot({
      matchId: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      matchScheduledAt: match.scheduledAt,
      dataCutoffAt,
      history,
      ratings: ratings.matchRatings(match.homeTeamId, match.awayTeamId),
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
      outcomeProbabilities: result.value.outcomeProbabilities,
    });
    generated += 1;
  }
  return { ok: true, detail: `generated:${generated}` };
}

async function evaluatePredictions(
  store: AppStore,
): Promise<{ readonly ok: true; readonly detail: string }> {
  const matches = await store.listMatches();
  // Demo results are fabricated; once real data exists they must not enter
  // the live scorecard (same rule as buildFinishedHistory).
  const liveMode = (await store.getDataMode()) === 'live';
  const finished = matches.filter(
    (match) =>
      match.status === 'finished' &&
      match.homeScore !== null &&
      match.awayScore !== null &&
      !(liveMode && String(match.sourceId) === SEED_SOURCE_ID),
  );

  const alreadyEvaluated = new Set(
    (await store.listPredictionEvaluations()).map((item) => item.predictionId),
  );
  const now = new Date();
  let evaluated = 0;
  let skipped = 0;
  for (const match of finished) {
    const prediction = await store.getLatestPrediction(match.id);
    if (!prediction) continue;
    if (alreadyEvaluated.has(prediction.id)) {
      skipped += 1;
      continue;
    }
    const actualHome = match.homeScore as number;
    const actualAway = match.awayScore as number;
    const evaluation = evaluatePrediction(
      prediction.predictedScore,
      actualHome,
      actualAway,
      prediction.outcomeProbabilities,
    );
    await store.savePredictionEvaluation({
      predictionId: prediction.id,
      matchId: match.id,
      modelVersion: prediction.modelVersion,
      competitionId: match.competitionId,
      kickoffAt: match.scheduledAt,
      generatedAt: prediction.generatedAt,
      generatedBeforeKickoff:
        prediction.generatedAt.getTime() < match.scheduledAt.getTime(),
      evaluatedAt: now,
      confidence: prediction.confidence,
      predictedHome: prediction.predictedScore.home,
      predictedAway: prediction.predictedScore.away,
      actualHome,
      actualAway,
      predictedOutcome: evaluation.predictedOutcome,
      actualOutcome: evaluation.actualOutcome,
      exactScore: evaluation.exactScore,
      winnerHit: evaluation.winnerImpliedMatch,
      brierScore: evaluation.brierScore,
      logLoss: evaluation.logLoss,
    });
    evaluated += 1;
  }
  return {
    ok: true,
    detail: `evaluated:${evaluated}${skipped > 0 ? `:already:${skipped}` : ''}`,
  };
}

function parseSeason(value: unknown): number | null {
  const season = Number(value);
  return Number.isInteger(season) && season >= 2000 && season <= 2100
    ? season
    : null;
}

function isSameUtcDay(date: Date, now: Date): boolean {
  return (
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate()
  );
}
