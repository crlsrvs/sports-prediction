import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AppStore } from '@sports-prediction/database';
import {
  asPredictionId,
  type FeatureSnapshot,
  type MatchAnalysis,
  type MatchCard,
  type MatchContext,
  type TeamComparisonMetric,
} from '@sports-prediction/domain';
import { buildFeatureSnapshot, type FinishedMatchResult } from '@sports-prediction/features';
import {
  evaluatePrediction,
  predictionEngine,
} from '@sports-prediction/prediction';
import { API_FOOTBALL_SOURCE_ID } from '@sports-prediction/shared';
import { STORE } from '../store/store.tokens.js';

@Injectable()
export class AnalysisService {
  constructor(@Inject(STORE) private readonly store: AppStore) {}

  async listTodayCards(): Promise<readonly MatchCard[]> {
    const matches = await this.store.listMatches();
    const today = new Date();
    const start = new Date(today);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setUTCHours(23, 59, 59, 999);

    const isToday = (time: number): boolean =>
      time >= start.getTime() && time <= end.getTime();

    const realMatches = matches.filter(
      (match) => String(match.sourceId) === API_FOOTBALL_SOURCE_ID,
    );

    let selected: readonly typeof matches[number][];
    if (realMatches.length > 0) {
      // Real data wins over seed. Show today's real fixtures, otherwise the
      // most recent real matchday available (free plans expose past seasons).
      const todaysReal = realMatches.filter((match) =>
        isToday(match.scheduledAt.getTime()),
      );
      if (todaysReal.length > 0) {
        selected = todaysReal;
      } else {
        // Pick the latest matchday per competition so every MVP league shows up.
        const byCompetition = new Map<string, typeof matches[number][]>();
        for (const match of realMatches) {
          const list = byCompetition.get(match.competitionId) ?? [];
          list.push(match);
          byCompetition.set(match.competitionId, list);
        }

        const picked: typeof matches[number][] = [];
        for (const list of byCompetition.values()) {
          const sortedDesc = [...list].sort(
            (a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime(),
          );
          const newest = sortedDesc[0];
          if (!newest) continue;
          const dayStart = new Date(newest.scheduledAt);
          dayStart.setUTCHours(0, 0, 0, 0);
          const windowStart = dayStart.getTime() - 3 * 24 * 60 * 60 * 1000;
          picked.push(
            ...sortedDesc
              .filter((match) => match.scheduledAt.getTime() >= windowStart)
              .slice(0, 12),
          );
        }

        selected = picked.sort(
          (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
        );
      }
    } else {
      selected = matches.filter((match) => isToday(match.scheduledAt.getTime()));
    }

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

    let prediction = await this.store.getLatestPrediction(match.id);
    let unavailableReason: string | null = null;

    if (!prediction) {
      const generated = predictionEngine.predict(context, featureSnapshot);
      if (!generated.ok) {
        unavailableReason =
          generated.error === 'missing_minimum_data'
            ? 'Faltan datos obligatorios para generar el análisis'
            : 'La ventana temporal de datos no es válida';
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
    const upcoming = matches.filter((match) => match.status === 'scheduled');
    let count = 0;
    for (const match of upcoming) {
      await this.getAnalysis(match.id);
      count += 1;
    }
    return count;
  }

  async runBacktest(): Promise<{
    readonly samples: number;
    readonly exactScoreRate: number;
    readonly winnerRate: number;
    readonly maeGoals: number;
  }> {
    const matches = await this.store.listMatches();
    const finished = matches.filter(
      (match) =>
        match.status === 'finished' &&
        match.homeScore !== null &&
        match.awayScore !== null,
    );

    let exact = 0;
    let winners = 0;
    let absError = 0;
    let samples = 0;

    for (const match of finished) {
      // Simulate historical cutoff: 1 hour before kickoff.
      const dataCutoffAt = new Date(match.scheduledAt.getTime() - 60 * 60 * 1000);
      const history = (await this.loadHistory()).filter(
        (item) => item.match.scheduledAt.getTime() < dataCutoffAt.getTime(),
      );
      const homeTeam = await this.store.getTeam(match.homeTeamId);
      const awayTeam = await this.store.getTeam(match.awayTeamId);
      const competitions = await this.store.listCompetitions();
      const competition = competitions.find(
        (item) => item.id === match.competitionId,
      );
      if (!homeTeam || !awayTeam || !competition) continue;

      const featureSnapshot = buildFeatureSnapshot({
        matchId: match.id,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        matchScheduledAt: match.scheduledAt,
        dataCutoffAt,
        history,
      });

      const result = predictionEngine.predict(
        {
          match,
          competition,
          homeTeam,
          awayTeam,
          featureSnapshot,
          dataCutoffAt,
        },
        featureSnapshot,
      );
      if (!result.ok) continue;

      const evaluation = evaluatePrediction(
        result.value.predictedScore,
        match.homeScore as number,
        match.awayScore as number,
      );
      samples += 1;
      if (evaluation.exactScore) exact += 1;
      if (evaluation.winnerImpliedMatch) winners += 1;
      absError +=
        Math.abs(evaluation.predictedHome - evaluation.actualHome) +
        Math.abs(evaluation.predictedAway - evaluation.actualAway);
    }

    return {
      samples,
      exactScoreRate: samples === 0 ? 0 : exact / samples,
      winnerRate: samples === 0 ? 0 : winners / samples,
      maeGoals: samples === 0 ? 0 : absError / samples,
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
    return matches
      .filter(
        (match) =>
          match.status === 'finished' &&
          match.homeScore !== null &&
          match.awayScore !== null,
      )
      .map((match) => ({
        match,
        homeScore: match.homeScore as number,
        awayScore: match.awayScore as number,
      }));
  }

  private buildComparison(
    snapshot: FeatureSnapshot | null,
  ): TeamComparisonMetric[] {
    if (!snapshot) return [];
    return [
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
