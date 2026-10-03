import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AppStore, BacktestRunRecord } from '@sports-prediction/database';
import {
  asPredictionId,
  type FeatureSnapshot,
  type MatchAnalysis,
  type MatchCard,
  type MatchContext,
  type TeamComparisonMetric,
} from '@sports-prediction/domain';
import {
  buildFeatureSnapshot,
  buildFinishedHistory,
  fitDixonColes,
  type DixonColesFit,
  type FinishedMatchResult,
} from '@sports-prediction/features';
import {
  DEFAULT_MODEL_VERSION,
  evaluatePrediction,
  getPredictionEngine,
  listModelVersions,
  predictionEngine,
} from '@sports-prediction/prediction';
import { isWithinPredictionHorizon } from '@sports-prediction/shared';
import { STORE } from '../store/store.tokens.js';
import {
  summarizeBacktest,
  type BacktestSample,
  type BacktestSummary,
} from './backtest.js';
import { selectDashboardMatches } from './selectDashboardMatches.js';

export interface LiveEvaluationSummary extends BacktestSummary {
  readonly modelVersion: string;
  readonly since: string;
  readonly liveOnly: boolean;
  /** Evaluations excluded because the prediction was generated after kickoff. */
  readonly backfilled: number;
  readonly firstKickoffAt: string | null;
  readonly lastKickoffAt: string | null;
}

/** Football seasons start in July; everything from July 1st counts as "this season". */
export function seasonStart(now: Date): Date {
  const year = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return new Date(Date.UTC(year, 6, 1));
}

function describeUnavailable(
  reason: 'missing_minimum_data' | 'missing_ratings' | 'invalid_cutoff',
): string {
  switch (reason) {
    case 'missing_minimum_data':
      return 'Faltan datos obligatorios para generar el análisis';
    case 'missing_ratings':
      return 'No hay suficiente historial para calcular los ratings de los equipos';
    case 'invalid_cutoff':
      return 'La ventana temporal de datos no es válida';
  }
}

/**
 * Dixon-Coles fits depend only on the set of results before the cutoff, so
 * cutoffs that see the same number of prior matches share one fit. This keeps
 * walk-forward backtests at one fit per distinct cutoff instead of per match.
 */
class RatingsCache {
  private readonly fits = new Map<number, DixonColesFit>();
  private readonly sortedTimes: number[];

  constructor(private readonly history: readonly FinishedMatchResult[]) {
    this.sortedTimes = history
      .map((item) => item.match.scheduledAt.getTime())
      .sort((a, b) => a - b);
  }

  fitFor(cutoffAt: Date): DixonColesFit {
    const cutoffMs = cutoffAt.getTime();
    let priorCount = 0;
    while (
      priorCount < this.sortedTimes.length &&
      (this.sortedTimes[priorCount] ?? Infinity) < cutoffMs
    ) {
      priorCount += 1;
    }
    const cached = this.fits.get(priorCount);
    if (cached) return cached;
    const fit = fitDixonColes({ history: this.history, cutoffAt });
    this.fits.set(priorCount, fit);
    return fit;
  }
}

@Injectable()
export class AnalysisService {
  constructor(@Inject(STORE) private readonly store: AppStore) {}

  async listTodayCards(): Promise<readonly MatchCard[]> {
    const [allMatches, competitions] = await Promise.all([
      this.store.listMatches(),
      this.store.listCompetitions(),
    ]);
    // Support leagues (inactive competitions) feed the models but stay out of
    // the public product.
    const featuredCompetitionIds = new Set(
      competitions.filter((item) => item.active).map((item) => String(item.id)),
    );
    const matches = allMatches.filter((match) =>
      featuredCompetitionIds.has(String(match.competitionId)),
    );
    const selected = selectDashboardMatches(matches);

    const cards: MatchCard[] = [];
    for (const match of selected) {
      const card = await this.toCard(match.id);
      if (card) cards.push(card);
    }
    return cards;
  }

  async getMatchCard(matchId: string): Promise<MatchCard> {
    const card = await this.toCard(matchId);
    if (!card) throw new NotFoundException('Partido no encontrado');
    return card;
  }

  async getAnalysis(matchId: string): Promise<MatchAnalysis> {
    const match = await this.store.getMatch(matchId);
    if (!match) throw new NotFoundException('Partido no encontrado');

    const [homeTeam, awayTeam, competitions] = await Promise.all([
      this.store.getTeam(match.homeTeamId),
      this.store.getTeam(match.awayTeamId),
      this.store.listCompetitions(),
    ]);

    if (!homeTeam || !awayTeam) {
      throw new NotFoundException('Equipos del partido no encontrados');
    }

    const competition =
      competitions.find((item) => item.id === match.competitionId) ?? null;
    if (!competition) {
      throw new NotFoundException('Competición no encontrada');
    }

    const dataCutoffAt = new Date(
      Math.min(Date.now(), match.scheduledAt.getTime() - 5 * 60 * 1000),
    );

    const history = await this.loadHistory();
    const ratings = fitDixonColes({ history, cutoffAt: dataCutoffAt });
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

    let prediction = await this.store.getLatestPrediction(match.id);
    let unavailableReason: string | null = null;

    if (!prediction) {
      const generated = predictionEngine.predict(context, featureSnapshot);
      if (!generated.ok) {
        unavailableReason = describeUnavailable(generated.error);
      } else {
        prediction = await this.store.savePrediction({
          id: asPredictionId(`pred-${match.id}-${Date.now()}`),
          matchId: match.id,
          generatedAt: new Date(),
          dataCutoffAt,
          modelVersion: generated.value.modelVersion,
          predictedScore: generated.value.predictedScore,
          expectedGoals: generated.value.expectedGoals,
          confidence: generated.value.confidence,
          factors: generated.value.factors,
          outcomeProbabilities: generated.value.outcomeProbabilities,
        });
      }
    }

    const evaluation =
      prediction &&
      match.status === 'finished' &&
      match.homeScore !== null &&
      match.awayScore !== null
        ? evaluatePrediction(
            prediction.predictedScore,
            match.homeScore,
            match.awayScore,
            prediction.outcomeProbabilities,
          )
        : null;

    return {
      match,
      competition,
      homeTeam,
      awayTeam,
      featureSnapshot,
      prediction,
      unavailableReason,
      comparison: this.buildComparison(featureSnapshot),
      evaluation,
    };
  }

  async generateAllPredictions(): Promise<number> {
    const matches = await this.store.listMatches();
    const upcoming = matches.filter(
      (match) =>
        match.status === 'scheduled' &&
        isWithinPredictionHorizon(match.scheduledAt),
    );
    let count = 0;
    for (const match of upcoming) {
      await this.getAnalysis(match.id);
      count += 1;
    }
    return count;
  }

  /**
   * Re-generates predictions with the current default model for every featured
   * match whose latest stored prediction comes from an older model version
   * (or for all of them when `force` is set, e.g. after the history changed).
   * New predictions are appended (old ones stay for reproducibility).
   */
  async regenerateOutdatedPredictions(
    options: { readonly force?: boolean } = {},
  ): Promise<{
    readonly regenerated: number;
    readonly modelVersion: string;
  }> {
    const [matches, teams, competitions, history] = await Promise.all([
      this.store.listMatches(),
      this.store.listTeams(),
      this.store.listCompetitions(),
      this.loadHistory(),
    ]);
    const teamsById = new Map(teams.map((team) => [String(team.id), team]));
    const competitionsById = new Map(
      competitions.map((item) => [String(item.id), item]),
    );

    const featuredIds = new Set(
      competitions.filter((item) => item.active).map((item) => String(item.id)),
    );
    const ratingsCache = new RatingsCache(history);
    let regenerated = 0;
    for (const match of matches) {
      if (!featuredIds.has(String(match.competitionId))) continue;
      const latest = await this.store.getLatestPrediction(match.id);
      if (!latest) continue;
      if (!options.force && latest.modelVersion === DEFAULT_MODEL_VERSION) continue;

      const homeTeam = teamsById.get(String(match.homeTeamId));
      const awayTeam = teamsById.get(String(match.awayTeamId));
      const competition = competitionsById.get(String(match.competitionId));
      if (!homeTeam || !awayTeam || !competition) continue;

      const dataCutoffAt = new Date(
        Math.min(Date.now(), match.scheduledAt.getTime() - 5 * 60 * 1000),
      );
      const featureSnapshot = buildFeatureSnapshot({
        matchId: match.id,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        matchScheduledAt: match.scheduledAt,
        dataCutoffAt,
        history,
        ratings: ratingsCache
          .fitFor(dataCutoffAt)
          .matchRatings(match.homeTeamId, match.awayTeamId),
      });
      const result = predictionEngine.predict(
        { match, competition, homeTeam, awayTeam, featureSnapshot, dataCutoffAt },
        featureSnapshot,
      );
      if (!result.ok) continue;

      await this.store.savePrediction({
        id: asPredictionId(`pred-${match.id}-${Date.now()}-${regenerated}`),
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
      regenerated += 1;
    }

    return { regenerated, modelVersion: DEFAULT_MODEL_VERSION };
  }

  listModels(): readonly string[] {
    return listModelVersions();
  }

  /**
   * Walk-forward backtest: for every finished match, rebuild features using only
   * data before kickoff, predict with the requested model and compare with the
   * real result. Results are persisted per model version for comparison.
   */
  async runBacktest(
    modelVersion: string = DEFAULT_MODEL_VERSION,
  ): Promise<BacktestRunRecord> {
    if (!listModelVersions().includes(modelVersion)) {
      throw new BadRequestException(
        `Modelo desconocido: ${modelVersion}. Disponibles: ${listModelVersions().join(', ')}`,
      );
    }
    const engine = getPredictionEngine(modelVersion);

    const [matches, teams, competitions] = await Promise.all([
      this.store.listMatches(),
      this.store.listTeams(),
      this.store.listCompetitions(),
    ]);
    const teamsById = new Map(teams.map((team) => [String(team.id), team]));
    const competitionsById = new Map(
      competitions.map((item) => [String(item.id), item]),
    );

    const history = buildFinishedHistory(matches);
    // Ratings learn from every tracked league, but we only score what the
    // product shows (featured competitions) so metrics stay comparable.
    const featuredIds = new Set(
      competitions.filter((item) => item.active).map((item) => String(item.id)),
    );
    const targets = history.filter((item) =>
      featuredIds.has(String(item.match.competitionId)),
    );

    const ratingsCache = new RatingsCache(history);
    const samples: BacktestSample[] = [];
    for (const target of targets) {
      const match = target.match;
      // Simulate historical cutoff: 1 hour before kickoff.
      const dataCutoffAt = new Date(match.scheduledAt.getTime() - 60 * 60 * 1000);
      const priorHistory = history.filter(
        (item) => item.match.scheduledAt.getTime() < dataCutoffAt.getTime(),
      );
      const homeTeam = teamsById.get(String(match.homeTeamId));
      const awayTeam = teamsById.get(String(match.awayTeamId));
      const competition = competitionsById.get(String(match.competitionId));
      if (!homeTeam || !awayTeam || !competition) continue;

      const featureSnapshot = buildFeatureSnapshot({
        matchId: match.id,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        matchScheduledAt: match.scheduledAt,
        dataCutoffAt,
        history: priorHistory,
        ratings: ratingsCache
          .fitFor(dataCutoffAt)
          .matchRatings(match.homeTeamId, match.awayTeamId),
      });

      const result = engine.predict(
        { match, competition, homeTeam, awayTeam, featureSnapshot, dataCutoffAt },
        featureSnapshot,
      );
      if (!result.ok) continue;

      const evaluation = evaluatePrediction(
        result.value.predictedScore,
        target.homeScore,
        target.awayScore,
        result.value.outcomeProbabilities,
      );
      samples.push({
        competitionId: String(competition.id),
        competitionName: competition.name,
        confidence: result.value.confidence,
        evaluation,
        actualOutcome: evaluation.actualOutcome,
      });
    }

    const summary = summarizeBacktest(samples);
    const run: BacktestRunRecord = {
      id: `backtest-${crypto.randomUUID()}`,
      modelVersion,
      ranAt: new Date(),
      samples: summary.samples,
      exactScoreRate: summary.exactScoreRate,
      winnerRate: summary.winnerRate,
      maeGoals: summary.maeGoals,
      brierScore: summary.brierScore,
      logLoss: summary.logLoss,
      details: {
        byCompetition: summary.byCompetition,
        baselines: summary.baselines,
        calibration: summary.calibration,
      },
    };
    await this.store.saveBacktestRun(run);
    return run;
  }

  listBacktestRuns(limit = 20): Promise<readonly BacktestRunRecord[]> {
    return this.store.listBacktestRuns(limit);
  }

  /**
   * How the model is doing on predictions that were actually stored and
   * later resolved, as opposed to the backtest which re-runs the model.
   * Defaults: current default model, season in progress, only predictions
   * generated before kickoff (backfilled ones are counted separately).
   */
  async summarizeLiveEvaluations(
    options: {
      readonly modelVersion?: string;
      readonly since?: Date;
      readonly liveOnly?: boolean;
    } = {},
  ): Promise<LiveEvaluationSummary> {
    const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
    const since = options.since ?? seasonStart(new Date());
    const liveOnly = options.liveOnly ?? true;

    const [records, allRecords, competitions] = await Promise.all([
      this.store.listPredictionEvaluations({ modelVersion, since, liveOnly }),
      this.store.listPredictionEvaluations({ modelVersion, since }),
      this.store.listCompetitions(),
    ]);
    const competitionsById = new Map(
      competitions.map((item) => [String(item.id), item]),
    );
    const featured = records.filter(
      (item) => competitionsById.get(String(item.competitionId))?.active === true,
    );

    const samples: BacktestSample[] = featured.map((item) => ({
      competitionId: String(item.competitionId),
      competitionName:
        competitionsById.get(String(item.competitionId))?.name ??
        String(item.competitionId),
      confidence: item.confidence,
      actualOutcome: item.actualOutcome,
      evaluation: {
        predictedHome: item.predictedHome,
        predictedAway: item.predictedAway,
        actualHome: item.actualHome,
        actualAway: item.actualAway,
        exactScore: item.exactScore,
        winnerImpliedMatch: item.winnerHit,
        predictedOutcome: item.predictedOutcome,
        actualOutcome: item.actualOutcome,
        brierScore: item.brierScore,
        logLoss: item.logLoss,
      },
    }));
    const kickoffs = featured.map((item) => item.kickoffAt.getTime());

    return {
      modelVersion,
      since: since.toISOString(),
      liveOnly,
      backfilled: allRecords.length - records.length,
      firstKickoffAt:
        kickoffs.length > 0 ? new Date(Math.min(...kickoffs)).toISOString() : null,
      lastKickoffAt:
        kickoffs.length > 0 ? new Date(Math.max(...kickoffs)).toISOString() : null,
      ...summarizeBacktest(samples),
    };
  }

  private async toCard(matchId: string): Promise<MatchCard | null> {
    const analysis = await this.getAnalysis(matchId).catch(() => null);
    if (!analysis) return null;

    return {
      match: analysis.match,
      competition: analysis.competition,
      homeTeam: analysis.homeTeam,
      awayTeam: analysis.awayTeam,
      homeForm: analysis.featureSnapshot?.homeForm ?? [],
      awayForm: analysis.featureSnapshot?.awayForm ?? [],
      prediction: analysis.prediction,
    };
  }

  private async loadHistory(): Promise<FinishedMatchResult[]> {
    const matches = await this.store.listMatches();
    return buildFinishedHistory(matches);
  }

  private buildComparison(
    snapshot: FeatureSnapshot | null,
  ): TeamComparisonMetric[] {
    if (!snapshot) return [];
    const ratings = snapshot.ratings;
    const average = ratings?.leagueAverageGoals ?? 1;
    const strengthRows: TeamComparisonMetric[] = ratings
      ? [
          {
            label: 'Ataque (ajustado por rival)',
            homeValue: Number(ratings.homeAttack.toFixed(2)),
            awayValue: Number(ratings.awayAttack.toFixed(2)),
          },
          {
            label: 'Defensa (ajustado por rival)',
            homeValue: Number((2 * average - ratings.homeDefense).toFixed(2)),
            awayValue: Number((2 * average - ratings.awayDefense).toFixed(2)),
          },
        ]
      : [
          {
            label: 'Ataque',
            homeValue: snapshot.homeAttack,
            awayValue: snapshot.awayAttack,
          },
          {
            label: 'Defensa',
            homeValue: 2 - snapshot.homeDefense,
            awayValue: 2 - snapshot.awayDefense,
          },
        ];
    return [
      ...strengthRows,
      {
        label: 'Forma reciente',
        homeValue: snapshot.homeForm.filter((item) => item === 'W').length,
        awayValue: snapshot.awayForm.filter((item) => item === 'W').length,
      },
      {
        label: 'Localía',
        homeValue: 1,
        awayValue: 0.2,
      },
    ];
  }
}
